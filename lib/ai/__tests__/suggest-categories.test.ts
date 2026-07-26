/**
 * Unit tests for the shared AI categorization helper.
 * The AI module and Prisma are mocked — no network or DB calls are made.
 *
 * The row-claim path uses `prisma.$queryRawUnsafe` (a raw UPDATE + RETURNING
 * that stamps `categorization_attempted_at` atomically); the mock returns
 * whatever the test wants as the "claimed" batch, and we then assert only
 * the follow-up work (suggestion writes, log rows, error-count bumps).
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findUnique: jest.fn() },
    budgetCategory: { findMany: jest.fn() },
    budgetTransaction: { update: jest.fn() },
    budgetCategorizationLog: { create: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('@/lib/ai/categorize-transaction', () => ({
  categorizeTransaction: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { categorizeTransaction } from '@/lib/ai/categorize-transaction';
import {
  prepareHousehold,
  runSuggestionBatch,
  suggestCategoriesForHousehold,
  type PreparedHousehold,
} from '@/lib/ai/suggest-categories';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCategorize = categorizeTransaction as jest.MockedFunction<typeof categorizeTransaction>;
const mockClaim = mockPrisma.$queryRawUnsafe as jest.Mock;

// Zero usage stub — categorizeTransaction is mocked here, so token counts are
// irrelevant; this just satisfies the CategorizeResult shape.
const USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
};

const CATEGORY_ROWS = [
  { id: 'cat-1', name: 'Groceries', group: { name: 'Food' } },
  { id: 'cat-2', name: 'Transit', group: { name: 'Transport' } },
];

const prepared: PreparedHousehold = {
  apiKey: 'sk-ant-test',
  categories: [
    { id: 'cat-1', name: 'Groceries', group: 'Food' },
    { id: 'cat-2', name: 'Transit', group: 'Transport' },
  ],
  nameById: new Map([
    ['cat-1', 'Groceries'],
    ['cat-2', 'Transit'],
  ]),
};

/** Build a claimed-row record with sensible defaults; overrides win. */
function claimedRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tx-1',
    amountIls: 10,
    notes: null,
    categorizationErrorCount: 0,
    payeeName: 'Payee',
    ...over,
  };
}

let originalEnvKey: string | undefined;

beforeEach(() => {
  jest.resetAllMocks();
  originalEnvKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValue({});
  (mockPrisma.budgetCategorizationLog.create as jest.Mock).mockResolvedValue({});
});

afterEach(() => {
  if (originalEnvKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalEnvKey;
});

describe('prepareHousehold', () => {
  it('returns no_api_key when neither household key nor env var is set', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await prepareHousehold('hh-1');
    expect(res).toEqual({ ok: false, reason: 'no_api_key' });
  });

  it('falls back to the env var', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(CATEGORY_ROWS);
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    const res = await prepareHousehold('hh-1');
    expect(res.ok).toBe(true);
  });

  it('returns no_categories when the household has none', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-h',
    });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await prepareHousehold('hh-1');
    expect(res).toEqual({ ok: false, reason: 'no_categories' });
  });
});

describe('runSuggestionBatch — claim SQL', () => {
  it('includes the unattempted filter when onlyUnattempted is true', async () => {
    mockClaim.mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { onlyUnattempted: true, limit: 25 });
    const [sql, ...params] = mockClaim.mock.calls[0];
    expect(String(sql)).toContain('categorization_attempted_at IS NULL');
    expect(params[0]).toBe('hh-1');
    expect(params.at(-1)).toBe(25);
  });

  it('omits the unattempted filter when onlyUnattempted is false', async () => {
    mockClaim.mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { onlyUnattempted: false });
    const [sql] = mockClaim.mock.calls[0];
    expect(String(sql)).not.toContain('categorization_attempted_at IS NULL');
  });

  it('caps the claim size at MAX_BATCH_LIMIT', async () => {
    mockClaim.mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { limit: 1000 });
    const params = mockClaim.mock.calls[0].slice(1);
    expect(params.at(-1)).toBe(25);
  });
});

describe('runSuggestionBatch — worker outcomes', () => {
  it('writes the suggestion payload on a confident result (no second attempted-at stamp)', async () => {
    mockClaim.mockResolvedValueOnce([claimedRow({ id: 'tx-1', payeeName: 'Shufersal' })]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: 'cat-1',
      confidence: 0.9,
      reasoning: 'x',
      usage: USAGE,
    });
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ suggested: 1, processed: 1 });
    const call = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'tx-1' });
    // The claim already stamped attempted_at atomically — the follow-up
    // update just attaches the suggestion, so no attemptedAt here.
    expect(call.data).toEqual({
      suggestedCategoryId: 'cat-1',
      suggestionConfidence: 0.9,
      suggestedAt: expect.any(Date),
    });
  });

  it('does not touch budget_transactions on a no_match result (stamp already on the row)', async () => {
    mockClaim.mockResolvedValueOnce([claimedRow({ id: 'tx-1', payeeName: 'Mystery' })]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: null,
      confidence: 0,
      reasoning: 'x',
      usage: USAGE,
    });
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ noMatch: 1 });
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('bumps the error counter on a transient error (stamp stays put from the claim)', async () => {
    mockClaim.mockResolvedValueOnce([
      claimedRow({ id: 'tx-1', payeeName: 'Boom', categorizationErrorCount: 0 }),
    ]);
    mockCategorize.mockRejectedValueOnce(new Error('rate limited'));
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ errors: 1 });
    const call = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    // Error path only bumps the count now; the stamp was already set by the
    // atomic claim so we never clear or re-set it here.
    expect(call.data).toEqual({ categorizationErrorCount: 1 });
    const logData = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0].data;
    expect(logData.status).toBe('error');
  });
});

describe('runSuggestionBatch — deadline', () => {
  it('skips model calls once the deadline has passed (rows still claimed but left alone)', async () => {
    mockClaim.mockResolvedValueOnce([claimedRow({ id: 'tx-1' })]);
    const counts = await runSuggestionBatch('hh-1', prepared, { deadlineMs: Date.now() - 1 });
    expect(counts.processed).toBe(0);
    expect(mockCategorize).not.toHaveBeenCalled();
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });
});

describe('suggestCategoriesForHousehold', () => {
  it('propagates a config failure from prepareHousehold', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await suggestCategoriesForHousehold('hh-1', { onlyUnattempted: true });
    expect(res).toEqual({ ok: false, reason: 'no_api_key' });
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('runs a batch and returns counts when configured', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant',
    });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(CATEGORY_ROWS);
    mockClaim.mockResolvedValueOnce([]);
    const res = await suggestCategoriesForHousehold('hh-1', { onlyUnattempted: true });
    expect(res).toEqual({
      ok: true,
      counts: { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 },
    });
  });
});
