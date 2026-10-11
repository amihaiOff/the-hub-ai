/**
 * Route tests for GET /api/cron/budget-report — monthly creation of the
 * just-closed cycle's report for every household with a budget.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findMany: jest.fn() },
    budgetReport: { findUnique: jest.fn() },
    cronRunLog: { create: jest.fn() },
  },
}));

jest.mock('@/lib/budget-report/generate', () => ({
  createReport: jest.fn(),
  triggerContinue: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { createReport, triggerContinue } from '@/lib/budget-report/generate';
import { lastClosedMonth } from '@/lib/budget-report/compute';
import { GET } from '../route';

const mockPrisma = prisma as unknown as {
  household: { findMany: jest.Mock };
  budgetReport: { findUnique: jest.Mock };
  cronRunLog: { create: jest.Mock };
};
const mockCreateReport = createReport as jest.MockedFunction<typeof createReport>;
const mockTriggerContinue = triggerContinue as jest.MockedFunction<typeof triggerContinue>;

const originalNodeEnv = process.env.NODE_ENV;
const originalSecret = process.env.CRON_SECRET;
const setNodeEnv = (value: string | undefined) =>
  Object.defineProperty(process.env, 'NODE_ENV', { value, writable: true });

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/budget-report', { headers });
}

describe('GET /api/cron/budget-report', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.cronRunLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 in production without the CRON_SECRET bearer', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';

    const res = await GET(request({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.cronRunLog.create).not.toHaveBeenCalled();
  });

  it('runs in production with the CRON_SECRET bearer', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';
    mockPrisma.household.findMany.mockResolvedValueOnce([]);

    const res = await GET(request({ authorization: 'Bearer secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, started: [], failed: [] });
  });

  it("skips households that already have the month's report and starts the rest", async () => {
    mockPrisma.household.findMany.mockResolvedValueOnce([
      { id: 'hh-has', billingCycleStartDay: 10 },
      { id: 'hh-new', billingCycleStartDay: 1 },
    ]);
    mockPrisma.budgetReport.findUnique
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);
    mockCreateReport.mockResolvedValueOnce({ id: 'rep-new', month: 'x', status: 'generating' });
    mockTriggerContinue.mockResolvedValueOnce(true);

    const res = await GET(request());
    const body = await res.json();

    const now = new Date();
    const monthHas = lastClosedMonth(now, 10);
    const monthNew = lastClosedMonth(now, 1);

    expect(res.status).toBe(200);
    expect(mockPrisma.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { budgetCategoryGroups: { some: {} } } })
    );
    expect(mockPrisma.budgetReport.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { householdId_month: { householdId: 'hh-has', month: monthHas } },
      })
    );
    expect(mockCreateReport).toHaveBeenCalledTimes(1);
    expect(mockCreateReport).toHaveBeenCalledWith('hh-new', monthNew, 'scheduled');
    expect(mockTriggerContinue).toHaveBeenCalledWith('rep-new');
    expect(body).toEqual({ success: true, started: [`hh-new:${monthNew}`], failed: [] });

    expect(mockPrisma.cronRunLog.create).toHaveBeenCalledTimes(1);
    const log = mockPrisma.cronRunLog.create.mock.calls[0][0].data;
    expect(log.cronPath).toBe('/api/cron/budget-report');
    expect(log.success).toBe(true);
  });

  it('records a per-household failure and keeps going', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPrisma.household.findMany.mockResolvedValueOnce([
      { id: 'hh-bad', billingCycleStartDay: 10 },
      { id: 'hh-ok', billingCycleStartDay: 10 },
    ]);
    mockPrisma.budgetReport.findUnique.mockResolvedValue(null);
    mockCreateReport
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ id: 'rep-ok', month: 'x', status: 'generating' });
    mockTriggerContinue.mockResolvedValue(true);

    const res = await GET(request());
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.failed).toEqual([{ householdId: 'hh-bad', error: 'db down' }]);
    expect(body.started).toHaveLength(1);
    expect(mockTriggerContinue).toHaveBeenCalledWith('rep-ok');
    expect(mockPrisma.cronRunLog.create.mock.calls[0][0].data.success).toBe(false);
    (console.error as jest.Mock).mockRestore();
  });
});
