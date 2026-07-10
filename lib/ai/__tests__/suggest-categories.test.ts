/**
 * Unit tests for the shared AI categorization helper.
 * The AI module and Prisma are mocked — no network or DB calls are made.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findUnique: jest.fn() },
    budgetCategory: { findMany: jest.fn() },
    budgetTransaction: { findMany: jest.fn(), update: jest.fn() },
    budgetCategorizationLog: { create: jest.fn() },
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
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(CATEGORY_ROWS);
    const res = await prepareHousehold('hh-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.prepared.apiKey).toBe('sk-env');
  });

  it('returns no_categories when the household has no budget categories', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant',
    });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await prepareHousehold('hh-1');
    expect(res).toEqual({ ok: false, reason: 'no_categories' });
  });
});

describe('runSuggestionBatch — onlyUnattempted scoping', () => {
  it('adds categorizationAttemptedAt: null to the query when onlyUnattempted is true', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { onlyUnattempted: true, limit: 25 });
    const call = (mockPrisma.budgetTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        householdId: 'hh-1',
        isDeleted: false,
        type: 'expense',
        categoryId: null,
        suggestedCategoryId: null,
        tags: { none: {} },
        categorizationAttemptedAt: null,
      })
    );
    expect(call.take).toBe(25);
  });

  it('omits the categorizationAttemptedAt filter when onlyUnattempted is false', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { onlyUnattempted: false });
    const call = (mockPrisma.budgetTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('categorizationAttemptedAt');
  });

  it('caps the limit at MAX_BATCH_LIMIT', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    await runSuggestionBatch('hh-1', prepared, { limit: 1000 });
    const call = (mockPrisma.budgetTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(25);
  });
});

describe('runSuggestionBatch — attempt stamping', () => {
  it('stamps categorizationAttemptedAt alongside a confident suggestion', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-1', amountIls: 120, notes: null, payee: { name: 'Shufersal' } },
    ]);
    mockCategorize.mockResolvedValueOnce({ categoryId: 'cat-1', confidence: 0.9, reasoning: 'x' });
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ suggested: 1, processed: 1 });
    const data = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0].data;
    expect(data.suggestedCategoryId).toBe('cat-1');
    expect(data.categorizationAttemptedAt).toBeInstanceOf(Date);
  });

  it('stamps categorizationAttemptedAt for a no_match (without a suggestion)', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-1', amountIls: 10, notes: null, payee: { name: 'Mystery' } },
    ]);
    mockCategorize.mockResolvedValueOnce({ categoryId: null, confidence: 0, reasoning: 'x' });
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ noMatch: 1 });
    const data = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual({ categorizationAttemptedAt: expect.any(Date) });
  });

  it('bumps the error counter but does NOT stamp attemptedAt on a first transient error', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'tx-1',
        amountIls: 10,
        notes: null,
        payee: { name: 'Boom' },
        categorizationErrorCount: 0,
      },
    ]);
    mockCategorize.mockRejectedValueOnce(new Error('rate limited'));
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ errors: 1 });
    // Counter incremented, row left re-queryable (no attemptedAt) for a retry.
    const data = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual({ categorizationErrorCount: 1 });
    const logData = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0].data;
    expect(logData.status).toBe('error');
  });

  it('gives up (stamps attemptedAt) once the error counter hits the cap', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      // Already failed twice; this third failure reaches MAX_CATEGORIZATION_ERRORS (3).
      {
        id: 'tx-1',
        amountIls: 10,
        notes: null,
        payee: { name: 'Boom' },
        categorizationErrorCount: 2,
      },
    ]);
    mockCategorize.mockRejectedValueOnce(new Error('still failing'));
    const counts = await runSuggestionBatch('hh-1', prepared, {});
    expect(counts).toMatchObject({ errors: 1 });
    const data = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0].data;
    expect(data.categorizationErrorCount).toBe(3);
    expect(data.categorizationAttemptedAt).toBeInstanceOf(Date);
  });
});

describe('runSuggestionBatch — deadline', () => {
  it('skips model calls once the deadline has passed (rows left for a later run)', async () => {
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-1', amountIls: 10, notes: null, payee: { name: 'A' } },
    ]);
    // A deadline already in the past → no work should start.
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
    expect(mockPrisma.budgetTransaction.findMany).not.toHaveBeenCalled();
  });

  it('runs a batch and returns counts when configured', async () => {
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant',
    });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(CATEGORY_ROWS);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await suggestCategoriesForHousehold('hh-1', { onlyUnattempted: true });
    expect(res).toEqual({
      ok: true,
      counts: { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 },
    });
  });
});
