/**
 * Route tests for the monthly budget reports API:
 *   GET  /api/budget/reports           (list + stuck-report recovery)
 *   POST /api/budget/reports/run       (start/regenerate a closed cycle)
 *   POST /api/budget/reports/continue  (internal hand-off step)
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findUniqueOrThrow: jest.fn() },
    budgetReport: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

// The orchestration itself is covered in lib/budget-report/__tests__/generate.test.ts.
jest.mock('@/lib/budget-report/generate', () => ({
  STUCK_MS: 15 * 60_000,
  createReport: jest.fn(),
  triggerContinue: jest.fn(),
  runAndHandOff: jest.fn(),
  findStuckReports: jest.fn(),
}));

// Keep NextRequest/NextResponse real but stub after() — it throws outside a
// real request scope. Tests invoke the captured callback to check what it runs.
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: jest.fn() };
});

import { NextRequest, after } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import {
  createReport,
  findStuckReports,
  runAndHandOff,
  triggerContinue,
} from '@/lib/budget-report/generate';
import { lastClosedMonth, shiftMonth } from '@/lib/budget-report/compute';
import { GET as LIST } from '../route';
import { POST as RUN } from '../run/route';
import { POST as CONTINUE } from '../continue/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  household: { findUniqueOrThrow: jest.Mock };
  budgetReport: { findUnique: jest.Mock; findMany: jest.Mock };
};
const mockAfter = after as jest.MockedFunction<typeof after>;
const mockCreateReport = createReport as jest.MockedFunction<typeof createReport>;
const mockTriggerContinue = triggerContinue as jest.MockedFunction<typeof triggerContinue>;
const mockRunAndHandOff = runAndHandOff as jest.MockedFunction<typeof runAndHandOff>;
const mockFindStuck = findStuckReports as jest.MockedFunction<typeof findStuckReports>;

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/budget/reports/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Run the callback the route passed to after(). */
async function runAfterCallback(index = 0) {
  const cb = mockAfter.mock.calls[index][0] as () => unknown;
  await cb();
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/budget/reports', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await LIST();
    expect(res.status).toBe(401);
    expect(mockPrisma.budgetReport.findMany).not.toHaveBeenCalled();
  });

  it("returns the household's reports newest first and schedules nothing when none are stuck", async () => {
    const rows = [
      { month: '2026-09', status: 'ready', runCount: 2, reportError: null, updatedAt: new Date() },
      { month: '2026-08', status: 'ready', runCount: 1, reportError: null, updatedAt: new Date() },
    ];
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockFindStuck.mockResolvedValueOnce([]);
    mockPrisma.budgetReport.findMany.mockResolvedValueOnce(rows);

    const res = await LIST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((r: { month: string }) => r.month)).toEqual(['2026-09', '2026-08']);
    expect(mockPrisma.budgetReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: 'household-1' }, orderBy: { month: 'desc' } })
    );
    expect(mockFindStuck).toHaveBeenCalledWith('household-1');
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('schedules triggerContinue for each stuck report via after()', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockFindStuck.mockResolvedValueOnce(['rep-a', 'rep-b']);
    mockPrisma.budgetReport.findMany.mockResolvedValueOnce([]);
    mockTriggerContinue.mockResolvedValue(true);

    const res = await LIST();
    expect(res.status).toBe(200);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockTriggerContinue).not.toHaveBeenCalled();

    await runAfterCallback();
    expect(mockTriggerContinue.mock.calls.map((c) => c[0])).toEqual(['rep-a', 'rep-b']);
  });
});

describe('POST /api/budget/reports/run', () => {
  const closed = () => lastClosedMonth(new Date(), 10);

  beforeEach(() => {
    mockPrisma.household.findUniqueOrThrow.mockResolvedValue({ billingCycleStartDay: 10 });
  });

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await RUN(post('run', { month: '2026-01' }));
    expect(res.status).toBe(401);
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it.each([['2026-13'], ['2026-1'], ['not-a-month'], [undefined]])(
    'returns 400 for a bad month (%s)',
    async (month) => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const res = await RUN(post('run', { month }));
      expect(res.status).toBe(400);
      expect((await res.json()).success).toBe(false);
      expect(mockCreateReport).not.toHaveBeenCalled();
    }
  );

  it('returns 400 for an unparsable body', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await RUN(post('run', '{not json'));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a cycle that hasn't closed yet", async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const current = shiftMonth(closed(), -1);

    const res = await RUN(post('run', { month: current }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("That cycle hasn't finished yet.");
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('returns 409 when the report is already generating recently', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce({
      status: 'generating',
      updatedAt: new Date(Date.now() - 60_000),
    });

    const res = await RUN(post('run', { month: closed() }));
    expect(res.status).toBe(409);
    expect(mockCreateReport).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('allows regenerating a report stuck in generating past STUCK_MS', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce({
      status: 'generating',
      updatedAt: new Date(Date.now() - 20 * 60_000),
    });
    mockCreateReport.mockResolvedValueOnce({ id: 'rep-1', month: closed(), status: 'generating' });

    const res = await RUN(post('run', { month: closed() }));
    expect(res.status).toBe(202);
  });

  it('returns 202, creates the report and schedules triggerContinue via after()', async () => {
    const month = closed();
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce({
      status: 'ready',
      updatedAt: new Date(),
    });
    mockCreateReport.mockResolvedValueOnce({ id: 'rep-1', month, status: 'generating' });
    mockTriggerContinue.mockResolvedValueOnce(true);

    const res = await RUN(post('run', { month }));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toEqual({ success: true, data: { id: 'rep-1', month, status: 'generating' } });
    expect(mockCreateReport).toHaveBeenCalledWith('household-1', month);
    expect(mockAfter).toHaveBeenCalledTimes(1);

    await runAfterCallback();
    expect(mockTriggerContinue).toHaveBeenCalledWith('rep-1');
  });
});

describe('POST /api/budget/reports/continue', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.CRON_SECRET;

  const setNodeEnv = (value: string | undefined) =>
    Object.defineProperty(process.env, 'NODE_ENV', { value, writable: true });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 in production without the CRON_SECRET bearer', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';

    const noHeader = await CONTINUE(post('continue', { id: 'rep-1' }));
    expect(noHeader.status).toBe(401);
    const wrong = await CONTINUE(
      post('continue', { id: 'rep-1' }, { authorization: 'Bearer nope' })
    );
    expect(wrong.status).toBe(401);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('accepts the CRON_SECRET bearer in production', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';

    const res = await CONTINUE(
      post('continue', { id: 'rep-1' }, { authorization: 'Bearer secret' })
    );
    expect(res.status).toBe(202);
  });

  it.each([[{}], [{ id: '' }], [{ id: 42 }], ['{bad']])(
    'returns 400 on a bad body (%p)',
    async (b) => {
      const res = await CONTINUE(post('continue', b));
      expect(res.status).toBe(400);
      expect(mockAfter).not.toHaveBeenCalled();
    }
  );

  it('returns 202 and runs runAndHandOff after the response', async () => {
    mockRunAndHandOff.mockResolvedValueOnce(undefined);

    const res = await CONTINUE(post('continue', { id: 'rep-1' }));
    expect(res.status).toBe(202);
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockRunAndHandOff).not.toHaveBeenCalled();

    await runAfterCallback();
    expect(mockRunAndHandOff).toHaveBeenCalledWith('rep-1');
  });
});
