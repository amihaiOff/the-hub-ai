/**
 * Unit tests for the shared multi-household drain loop.
 * prepareHousehold / runSuggestionBatch are mocked so no AI/DB work runs.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/ai/suggest-categories', () => ({
  // Re-export the real constant so DRAIN_BATCH_LIMIT stays in sync.
  MAX_BATCH_LIMIT: 25,
  prepareHousehold: jest.fn(),
  runSuggestionBatch: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { prepareHousehold, runSuggestionBatch } from '@/lib/ai/suggest-categories';
import { drainSuggestions } from '@/lib/ai/drain-suggestions';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockPrepare = prepareHousehold as jest.MockedFunction<typeof prepareHousehold>;
const mockRunBatch = runSuggestionBatch as jest.MockedFunction<typeof runSuggestionBatch>;

const prepared = { apiKey: 'sk', categories: [], nameById: new Map() };
const emptyCounts = { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 };

// A deadline far in the future so the wall-clock guard never trips (except in
// the dedicated deadline test).
const FAR_FUTURE = 1e15;

beforeEach(() => jest.resetAllMocks());

it('records config-error households as skipped and runs no batch for them', async () => {
  (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
  mockPrepare.mockResolvedValueOnce({ ok: false, reason: 'no_api_key' });

  const results = await drainSuggestions(FAR_FUTURE);
  expect(results.householdsProcessed).toBe(0);
  expect(results.skipped).toEqual([{ householdId: 'hh-1', reason: 'no_api_key' }]);
  expect(mockRunBatch).not.toHaveBeenCalled();
});

it('keeps draining while batches come back full, then stops on a partial batch', async () => {
  (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
  mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
  mockRunBatch
    .mockResolvedValueOnce({ ...emptyCounts, processed: 25, suggested: 25 })
    .mockResolvedValueOnce({ ...emptyCounts, processed: 3, suggested: 2, noMatch: 1 });

  const results = await drainSuggestions(FAR_FUTURE);
  expect(mockRunBatch).toHaveBeenCalledTimes(2);
  expect(results.householdsProcessed).toBe(1);
  expect(results.processed).toBe(28);
  expect(results.suggested).toBe(27);
  expect(results.noMatch).toBe(1);
  // Always requests the unattempted-only slice, with the deadline forwarded.
  expect(mockRunBatch.mock.calls[0][2]).toMatchObject({
    onlyUnattempted: true,
    limit: 25,
    deadlineMs: FAR_FUTURE,
  });
});

it('stops a household after the per-run batch cap even if batches stay full', async () => {
  (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
  mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
  mockRunBatch.mockResolvedValue({ ...emptyCounts, processed: 25, suggested: 25 });

  await drainSuggestions(FAR_FUTURE);
  expect(mockRunBatch).toHaveBeenCalledTimes(4);
});

it('stops a household after one full batch that produced only errors', async () => {
  (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'hh-1' }]);
  mockPrepare.mockResolvedValueOnce({ ok: true, prepared });
  mockRunBatch.mockResolvedValue({ ...emptyCounts, processed: 25, errors: 25 });

  const results = await drainSuggestions(FAR_FUTURE);
  expect(mockRunBatch).toHaveBeenCalledTimes(1);
  expect(results.errors).toBe(25);
});

it('stops before further households once the deadline passes and flags timedOut', async () => {
  (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([
    { id: 'hh-1' },
    { id: 'hh-2' },
  ]);
  mockPrepare.mockResolvedValue({ ok: true, prepared });
  mockRunBatch.mockResolvedValueOnce({ ...emptyCounts, processed: 2, suggested: 2 });

  // drainSuggestions checks Date.now at: hh-1 top, hh-1 batch top, hh-2 top.
  const nowSpy = jest.spyOn(Date, 'now');
  nowSpy
    .mockReturnValueOnce(0) // hh-1 household check — within budget
    .mockReturnValueOnce(0) // hh-1 batch check — within budget
    .mockReturnValue(1e9); // hh-2 household check — past the deadline

  const results = await drainSuggestions(1000);
  expect(results.timedOut).toBe(true);
  expect(results.householdsProcessed).toBe(1);
  expect(results.suggested).toBe(2);
  expect(mockRunBatch).toHaveBeenCalledTimes(1);
  expect(mockPrepare).toHaveBeenCalledTimes(1); // hh-2 never prepared
  nowSpy.mockRestore();
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

  const results = await drainSuggestions(FAR_FUTURE);
  expect(results.householdsProcessed).toBe(1);
  expect(results.suggested).toBe(2);
  expect(results.skipped).toEqual([{ householdId: 'hh-2', reason: 'no_categories' }]);
});
