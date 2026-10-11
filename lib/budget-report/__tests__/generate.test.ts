/**
 * Unit tests for lib/budget-report/generate.ts — the multi-invocation
 * orchestration of the report agent (lock claim, hand-off, finishing).
 * The agent itself (Anthropic calls) and Prisma are mocked.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    budgetReport: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    generalLog: { create: jest.fn(), findFirst: jest.fn() },
    household: { findUniqueOrThrow: jest.fn() },
    budgetCategory: { findMany: jest.fn() },
    budgetTransaction: { findMany: jest.fn() },
  },
}));

// Keep the pure usage helpers real; stub everything that talks to Anthropic.
jest.mock('../agent', () => {
  const actual = jest.requireActual('../agent');
  return {
    ...actual,
    createClient: jest.fn(() => ({ fake: 'client' })),
    startAgentState: jest.fn(),
    runReportAgent: jest.fn(),
    deleteAgentFiles: jest.fn(),
  };
});

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  createClient,
  deleteAgentFiles,
  runReportAgent,
  startAgentState,
  type AgentState,
} from '../agent';
import { MAX_RUNS } from '../shared';
import {
  STUCK_MS,
  createReport,
  findStuckReports,
  resumeStuckReports,
  runReportStep,
  triggerContinue,
} from '../generate';

const mockPrisma = prisma as unknown as {
  budgetReport: Record<
    'updateMany' | 'findUniqueOrThrow' | 'update' | 'findMany' | 'findUnique' | 'upsert',
    jest.Mock
  >;
  generalLog: { create: jest.Mock; findFirst: jest.Mock };
  household: { findUniqueOrThrow: jest.Mock };
  budgetCategory: { findMany: jest.Mock };
  budgetTransaction: { findMany: jest.Mock };
};
const mockStart = startAgentState as jest.MockedFunction<typeof startAgentState>;
const mockRun = runReportAgent as jest.MockedFunction<typeof runReportAgent>;
const mockDelete = deleteAgentFiles as jest.MockedFunction<typeof deleteAgentFiles>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

const usage = (n: number) => ({
  inputTokens: n,
  outputTokens: n,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
});

const savedState: AgentState = { messages: [], containerId: 'c1', fileIds: ['f1'] };
const nextState: AgentState = { messages: [], containerId: 'c1', fileIds: ['f1', 'f2'] };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rep-1',
    householdId: 'hh-1',
    month: '2026-09',
    status: 'generating',
    usage: null,
    agentState: null,
    runCount: 1,
    ...overrides,
  };
}

describe('runReportStep', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.ANTHROPIC_API_KEY;
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
    mockPrisma.budgetReport.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.budgetReport.update.mockResolvedValue({});
    // First household lookup is runReportStep's; loadReportData's comes second.
    mockPrisma.household.findUniqueOrThrow.mockResolvedValue({
      anthropicApiKey: 'sk-test',
      reportPrompt: null,
      billingCycleStartDay: 10,
    });
    mockPrisma.budgetCategory.findMany.mockResolvedValue([]);
    mockPrisma.budgetTransaction.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns 'busy' and does nothing when the lock can't be claimed", async () => {
    mockPrisma.budgetReport.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(runReportStep('rep-1')).resolves.toBe('busy');

    const claim = mockPrisma.budgetReport.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: 'rep-1', status: 'generating' });
    expect(claim.data.runCount).toEqual({ increment: 1 });
    expect(mockPrisma.budgetReport.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockPrisma.budgetReport.updateMany).toHaveBeenCalledTimes(1);
  });

  it('on the first run uploads files via startAgentState, then runs the agent', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(row());
    mockStart.mockResolvedValueOnce(savedState);
    mockRun.mockResolvedValueOnce({
      status: 'paused',
      state: nextState,
      usage: usage(10),
    });

    await expect(runReportStep('rep-1')).resolves.toBe('continue');

    expect(mockStart).toHaveBeenCalledTimes(1);
    const [, prompt, files] = mockStart.mock.calls[0];
    expect(prompt).toContain('cycle 2026-09');
    // Cycle 2026-09 with startDay 10 runs Sep 10 → Oct 9 inclusive.
    expect(prompt).toContain('2026-09-10 to 2026-10-09');
    expect(files.map((f) => f.name)).toEqual(['transactions.csv', 'categories.csv', 'stats.json']);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ state: savedState, finalRun: false })
    );
  });

  it('does not re-upload when agentState is already saved', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: 2 })
    );
    mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });

    await runReportStep('rep-1');

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ state: savedState }));
  });

  it("'paused' before MAX_RUNS saves agentState + accumulated usage and returns 'continue'", async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: 2, usage: usage(5) })
    );
    mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(7) });

    await expect(runReportStep('rep-1')).resolves.toBe('continue');

    expect(mockPrisma.budgetReport.updateMany).toHaveBeenCalledTimes(2);
    const { where, data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(where).toEqual({ id: 'rep-1', lastRunAt: expect.any(Date) });
    expect(data.agentState).toBe(nextState);
    expect(data.usage).toEqual(usage(12));
    expect(data.lastRunAt).toBeNull();
    expect(data.status).toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('stops without calling the model once a report has used up its runs (e.g. after killed runs)', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: 5 })
    );

    await expect(runReportStep('rep-1')).resolves.toBe('done');

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(expect.anything(), savedState);
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data.status).toBe('ready');
    expect(data.reportError).toMatch(/didn't finish within 4 runs/);
  });

  it('saves progress after every turn, tied to this run holding the lock', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, usage: usage(5) })
    );
    mockRun.mockImplementationOnce(async (opts) => {
      await opts.onTurn!(nextState, usage(3));
      return { status: 'done', state: nextState, usage: usage(7), report: undefined };
    });

    await runReportStep('rep-1');

    const claimAt = mockPrisma.budgetReport.updateMany.mock.calls[0][0].data.lastRunAt;
    const { where, data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(where).toEqual({ id: 'rep-1', lastRunAt: claimAt });
    expect(data.agentState).toBe(nextState);
    expect(data.usage).toEqual(usage(8));
  });

  it("doesn't hand off when the report was regenerated while this run was working", async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState })
    );
    mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });
    mockPrisma.budgetReport.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 0 }); // save: lock lost

    await expect(runReportStep('rep-1')).resolves.toBe('done');
  });

  describe('Labs → Activity events', () => {
    const events = () =>
      mockPrisma.generalLog.create.mock.calls.map((c) => c[0].data as Record<string, unknown>);

    it('records a continued run (pre-read) from run 2 onwards', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState, runCount: 2 })
      );
      mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });

      await runReportStep('rep-1');

      expect(events()).toEqual([
        expect.objectContaining({
          householdId: 'hh-1',
          type: 'report_continued',
          subjectType: 'budget_report',
          subjectId: '2026-09',
          description: expect.stringContaining('run 2 of 4'),
          readAt: expect.any(Date),
        }),
      ]);
    });

    it('does not record "continued" for the first run', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState })
      );
      mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });

      await runReportStep('rep-1');

      expect(events()).toEqual([]);
    });

    it('records a finished report (pre-read)', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState })
      );
      mockRun.mockResolvedValueOnce({
        status: 'done',
        state: nextState,
        usage: usage(1),
        report: undefined,
      });

      await runReportStep('rep-1');

      expect(events()).toEqual([
        expect.objectContaining({
          type: 'report_ready',
          description: expect.stringContaining('September 2026 budget report is ready'),
          readAt: expect.any(Date),
        }),
      ]);
    });

    it('records a failure as unread so it shows the badge', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState })
      );
      mockRun.mockResolvedValueOnce({
        status: 'failed',
        state: nextState,
        usage: usage(1),
        error: 'boom',
      });

      await runReportStep('rep-1');

      expect(events()).toEqual([
        expect.objectContaining({
          type: 'report_failed',
          description: expect.stringContaining('boom'),
          readAt: null,
        }),
      ]);
    });

    it('records nothing when the run lost the lock before finishing', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState })
      );
      mockRun.mockResolvedValueOnce({ status: 'done', state: nextState, usage: usage(1) });
      mockPrisma.budgetReport.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim
        .mockResolvedValueOnce({ count: 0 }); // finish: lock lost

      await runReportStep('rep-1');

      expect(events()).toEqual([]);
    });

    it('never lets a logging failure break the report', async () => {
      mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
        row({ agentState: savedState })
      );
      mockRun.mockResolvedValueOnce({ status: 'done', state: nextState, usage: usage(1) });
      mockPrisma.generalLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(runReportStep('rep-1')).resolves.toBe('done');
    });
  });

  it("'paused' on the final run finishes with a reportError", async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: MAX_RUNS })
    );
    mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });

    await expect(runReportStep('rep-1')).resolves.toBe('done');

    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ finalRun: true }));
    expect(mockDelete).toHaveBeenCalledWith(expect.anything(), nextState);
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data.status).toBe('ready');
    expect(data.reportError).toBe(`The agent didn't finish within ${MAX_RUNS} runs.`);
    expect(data.report).toBe(Prisma.DbNull);
    expect(data.agentState).toBe(Prisma.DbNull);
  });

  it("'done' saves the report with status 'ready' and no error", async () => {
    const report = { summary: 'All good' };
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: 2, usage: usage(3) })
    );
    mockRun.mockResolvedValueOnce({
      status: 'done',
      state: nextState,
      usage: usage(4),
      report: report as never,
    });

    await expect(runReportStep('rep-1')).resolves.toBe('done');

    expect(mockDelete).toHaveBeenCalledWith(expect.anything(), nextState);
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data).toMatchObject({
      status: 'ready',
      report,
      reportError: null,
      usage: usage(7),
      lastRunAt: null,
    });
    expect(data.agentState).toBe(Prisma.DbNull);
  });

  it("'failed' finishes with the agent's error", async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, runCount: 1 })
    );
    mockRun.mockResolvedValueOnce({
      status: 'failed',
      state: nextState,
      usage: usage(1),
      error: 'bad output',
    });

    await expect(runReportStep('rep-1')).resolves.toBe('done');
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data.status).toBe('ready');
    expect(data.reportError).toBe('bad output');
  });

  it('finishes numbers-only when no API key is configured', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(row({ usage: usage(2) }));
    mockPrisma.household.findUniqueOrThrow.mockReset();
    mockPrisma.household.findUniqueOrThrow.mockResolvedValueOnce({
      anthropicApiKey: null,
      reportPrompt: null,
    });

    await expect(runReportStep('rep-1')).resolves.toBe('done');

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data.status).toBe('ready');
    expect(data.reportError).toMatch(/No Anthropic API key/);
    expect(data.usage).toEqual(usage(2));
  });

  it('falls back to the ANTHROPIC_API_KEY env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState })
    );
    mockPrisma.household.findUniqueOrThrow.mockReset();
    mockPrisma.household.findUniqueOrThrow.mockResolvedValueOnce({
      anthropicApiKey: null,
      reportPrompt: null,
    });
    mockRun.mockResolvedValueOnce({ status: 'paused', state: nextState, usage: usage(1) });

    await expect(runReportStep('rep-1')).resolves.toBe('continue');
    expect(mockCreateClient).toHaveBeenCalledWith('sk-env');
  });

  it('a thrown error finishes with reportError and cleans up files', async () => {
    mockPrisma.budgetReport.findUniqueOrThrow.mockResolvedValueOnce(
      row({ agentState: savedState, usage: usage(9) })
    );
    mockRun.mockRejectedValueOnce(new Error('boom'));

    await expect(runReportStep('rep-1')).resolves.toBe('done');

    expect(mockDelete).toHaveBeenCalledWith(expect.anything(), savedState);
    const { data } = mockPrisma.budgetReport.updateMany.mock.calls[1][0];
    expect(data.status).toBe('ready');
    expect(data.reportError).toBe('The report agent failed: boom');
    expect(data.usage).toEqual(usage(9));
  });
});

describe('triggerContinue', () => {
  const originalFetch = global.fetch;
  const envKeys = [
    'CRON_SECRET',
    'VERCEL_AUTOMATION_BYPASS_SECRET',
    'VERCEL_ENV',
    'VERCEL_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ] as const;
  const savedEnv: Partial<Record<(typeof envKeys)[number], string>> = {};
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    (console.error as jest.Mock).mockRestore();
    global.fetch = originalFetch;
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('posts the id with the cron bearer and returns true on success', async () => {
    process.env.CRON_SECRET = 'secret';
    process.env.VERCEL_URL = 'preview.example.app';
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass';
    fetchMock.mockResolvedValueOnce({ ok: true });

    await expect(triggerContinue('rep-1')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://preview.example.app/api/budget/reports/continue');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ id: 'rep-1' });
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(init.headers['x-vercel-protection-bypass']).toBe('bypass');
  });

  it('uses the production URL on Vercel production', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.example.app';
    process.env.VERCEL_URL = 'deploy-xyz.example.app';
    fetchMock.mockResolvedValueOnce({ ok: true });

    await triggerContinue('rep-1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://prod.example.app/api/budget/reports/continue');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it('retries after a non-ok response and a network error, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true });

    const p = triggerContinue('rep-1');
    await jest.advanceTimersByTimeAsync(1000 + 2000);
    await expect(p).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 attempts and returns false', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce({
      householdId: 'hh-1',
      month: '2026-09',
    });

    const p = triggerContinue('rep-1');
    await jest.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    await expect(p).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('hand-off failed'));
    // Left unread in Labs → Activity so the stall is visible.
    expect(mockPrisma.generalLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'hh-1',
        type: 'report_handoff_failed',
        subjectId: '2026-09',
        readAt: null,
      }),
    });
  });
});

describe('findStuckReports', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns ids of generating reports untouched for STUCK_MS', async () => {
    const now = new Date('2026-10-11T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const stuck = [
      { id: 'a', month: '2026-08' },
      { id: 'b', month: '2026-09' },
    ];
    mockPrisma.budgetReport.findMany.mockResolvedValueOnce(stuck);

    await expect(findStuckReports('hh-1')).resolves.toEqual(stuck);

    const { where } = mockPrisma.budgetReport.findMany.mock.calls[0][0];
    expect(where.householdId).toBe('hh-1');
    expect(where.status).toBe('generating');
    expect(where.updatedAt.lt).toEqual(new Date(now - STUCK_MS));
    (Date.now as jest.Mock).mockRestore();
  });

  it('returns an empty list when nothing is stuck', async () => {
    mockPrisma.budgetReport.findMany.mockResolvedValueOnce([]);
    await expect(findStuckReports('hh-1')).resolves.toEqual([]);
  });
});

describe('createReport activity events', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.household.findUniqueOrThrow.mockResolvedValue({
      anthropicApiKey: null,
      reportPrompt: null,
      billingCycleStartDay: 10,
    });
    mockPrisma.budgetCategory.findMany.mockResolvedValue([]);
    mockPrisma.budgetTransaction.findMany.mockResolvedValue([]);
    mockPrisma.budgetReport.upsert.mockResolvedValue({
      id: 'rep-1',
      month: '2026-09',
      status: 'generating',
    });
  });

  it('records a scheduled start', async () => {
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce(null);
    await createReport('hh-1', '2026-09', 'scheduled');
    expect(mockPrisma.generalLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'report_started',
        subjectId: '2026-09',
        description: 'Started the September 2026 budget report (monthly schedule).',
        readAt: expect.any(Date),
      }),
    });
  });

  it('records a regeneration requested in the app', async () => {
    mockPrisma.budgetReport.findUnique.mockResolvedValueOnce({ agentState: null });
    await createReport('hh-1', '2026-09');
    expect(mockPrisma.generalLog.create.mock.calls[0][0].data.description).toBe(
      'Regenerating the September 2026 budget report (requested in the app).'
    );
  });
});

describe('resumeStuckReports', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not log "resumed" when the hand-off fails, and keeps one unread "stalled" entry', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    mockPrisma.budgetReport.findUnique.mockResolvedValue({ householdId: 'hh-1', month: '2026-08' });
    // An unread "stalled" entry for this report already exists.
    mockPrisma.generalLog.findFirst.mockResolvedValue({ id: 'log-1' });

    const p = resumeStuckReports('hh-1', [{ id: 'rep-a', month: '2026-08' }]);
    await jest.advanceTimersByTimeAsync(7000);
    await p;

    expect(mockPrisma.generalLog.findFirst).toHaveBeenCalledWith({
      where: {
        householdId: 'hh-1',
        type: 'report_handoff_failed',
        subjectId: '2026-08',
        readAt: null,
      },
      select: { id: true },
    });
    expect(mockPrisma.generalLog.create).not.toHaveBeenCalled();
    jest.useRealTimers();
    (console.error as jest.Mock).mockRestore();
  });

  it('records each resume and hands the report to a fresh run', async () => {
    await resumeStuckReports('hh-1', [{ id: 'rep-a', month: '2026-08' }]);
    expect(mockPrisma.generalLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'report_resumed', subjectId: '2026-08' }),
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/budget/reports/continue'),
      expect.objectContaining({ body: JSON.stringify({ id: 'rep-a' }) })
    );
  });
});
