/**
 * Tests for GET /api/cron/suggest-categories (the automatic categorization drain).
 * The shared helper is mocked so no AI/DB categorization actually runs.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findMany: jest.fn() },
    cronRunLog: { create: jest.fn() },
  },
}));

jest.mock('@/lib/ai/suggest-categories', () => ({
  // Re-export the real constant so the route's batch limit stays in sync.
  MAX_BATCH_LIMIT: 25,
  prepareHousehold: jest.fn(),
  runSuggestionBatch: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { prepareHousehold, runSuggestionBatch } from '@/lib/ai/suggest-categories';
import { GET } from '../route';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockPrepare = prepareHousehold as jest.MockedFunction<typeof prepareHousehold>;
const mockRunBatch = runSuggestionBatch as jest.MockedFunction<typeof runSuggestionBatch>;

const prepared = { apiKey: 'sk', categories: [], nameById: new Map() };
const emptyCounts = { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 };

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/suggest-categories', { headers });
}

let originalNodeEnv: string | undefined;
let originalCronSecret: string | undefined;

beforeEach(() => {
  jest.resetAllMocks();
  originalNodeEnv = process.env.NODE_ENV;
  originalCronSecret = process.env.CRON_SECRET;
  (mockPrisma.cronRunLog.create as jest.Mock).mockResolvedValue({});
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
  else (process.env as Record<string, unknown>).NODE_ENV = originalNodeEnv;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe('auth', () => {
  it('returns 401 in production without the cron secret', async () => {
    (process.env as Record<string, unknown>).NODE_ENV = 'production';
    process.env.CRON_SECRET = 'secret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
  });

  it('proceeds in production with the correct cron secret', async () => {
    (process.env as Record<string, unknown>).NODE_ENV = 'production';
    process.env.CRON_SECRET = 'secret';
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await GET(makeRequest({ authorization: 'Bearer secret' }));
    expect(res.status).toBe(200);
  });
});

describe('drain behavior', () => {
  it('records config-error households as skipped and does not run a batch for them', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
    mockPrepare.mockResolvedValueOnce({ ok: false, reason: 'no_api_key' });

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.results.householdsProcessed).toBe(0);
    expect(json.results.skipped).toEqual([{ householdId: 'hh-1', reason: 'no_api_key' }]);
    expect(mockRunBatch).not.toHaveBeenCalled();
  });

  it('keeps draining a household while batches come back full, then stops on a partial batch', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
    mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
    mockRunBatch
      .mockResolvedValueOnce({ ...emptyCounts, processed: 25, suggested: 25 })
      .mockResolvedValueOnce({ ...emptyCounts, processed: 3, suggested: 2, noMatch: 1 });

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(mockRunBatch).toHaveBeenCalledTimes(2);
    expect(json.results.householdsProcessed).toBe(1);
    expect(json.results.processed).toBe(28);
    expect(json.results.suggested).toBe(27);
    expect(json.results.noMatch).toBe(1);
    // Always requests the unattempted-only slice.
    expect(mockRunBatch.mock.calls[0][2]).toMatchObject({ onlyUnattempted: true, limit: 25 });
  });

  it('stops a household after the per-run batch cap even if batches stay full', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
    mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
    // Always returns a full batch — the cap (4) must bound the loop.
    mockRunBatch.mockResolvedValue({ ...emptyCounts, processed: 25, suggested: 25 });

    await GET(makeRequest());
    expect(mockRunBatch).toHaveBeenCalledTimes(4);
  });

  it('stops before processing further households once the deadline passes and flags timedOut', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'hh-1' },
      { id: 'hh-2' },
    ]);
    mockPrepare.mockResolvedValue({ ok: true, prepared });
    // hh-1 drains in a single partial batch; hh-2 must never be touched.
    mockRunBatch.mockResolvedValueOnce({ ...emptyCounts, processed: 2, suggested: 2 });

    // Every dependency in the loop is mocked, so Date.now is called exactly:
    // deadline calc → hh-1 top check → hh-1 batch check → hh-2 top check.
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy
      .mockReturnValueOnce(0) // deadline = DEADLINE_MS
      .mockReturnValueOnce(0) // hh-1 household check — within budget
      .mockReturnValueOnce(0) // hh-1 batch check — within budget
      .mockReturnValue(1e15); // hh-2 household check — past the deadline

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.results.timedOut).toBe(true);
    expect(json.results.householdsProcessed).toBe(1);
    expect(json.results.suggested).toBe(2);
    expect(mockRunBatch).toHaveBeenCalledTimes(1);
    expect(mockPrepare).toHaveBeenCalledTimes(1); // hh-2 never prepared
    nowSpy.mockRestore();
  });

  it('stops a household after one full batch that produced only errors', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
    mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
    // Full batch, zero progress (all errors) — must not burn the remaining
    // batches this run; the bounded retry counter handles it across runs.
    mockRunBatch.mockResolvedValue({ ...emptyCounts, processed: 25, errors: 25 });

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(mockRunBatch).toHaveBeenCalledTimes(1);
    expect(json.results.errors).toBe(25);
  });

  it('processes multiple households independently', async () => {
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'hh-1' },
      { id: 'hh-2' },
    ]);
    mockPrepare
      .mockResolvedValueOnce({ ok: true, prepared })
      .mockResolvedValueOnce({ ok: false, reason: 'no_categories' });
    mockRunBatch.mockResolvedValueOnce({ ...emptyCounts, processed: 2, suggested: 2 });

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.results.householdsProcessed).toBe(1);
    expect(json.results.suggested).toBe(2);
    expect(json.results.skipped).toEqual([{ householdId: 'hh-2', reason: 'no_categories' }]);
  });
});
