/**
 * Integration tests for POST /api/budget/transactions/suggest.
 * The AI module is mocked — no network calls are made.
 */

import { NextRequest } from 'next/server';

// Mocks must be declared before importing the route.
jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findUnique: jest.fn(),
    },
    budgetCategory: {
      findMany: jest.fn(),
    },
    budgetTransaction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    budgetCategorizationLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/ai/categorize-transaction', () => ({
  categorizeTransaction: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { categorizeTransaction } from '@/lib/ai/categorize-transaction';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCategorize = categorizeTransaction as jest.MockedFunction<typeof categorizeTransaction>;

// Zero usage stub — these tests mock categorizeTransaction, so the exact token
// counts don't matter; they only need to satisfy the CategorizeResult shape.
const USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
};

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const CATEGORY_ROWS = [
  { id: 'cat-1', name: 'Groceries', group: { name: 'Food' } },
  { id: 'cat-2', name: 'Transit', group: { name: 'Transport' } },
];

function makeRequest(body: unknown = {}) {
  return new NextRequest('http://localhost/api/budget/transactions/suggest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Default happy-path wiring: authed, key set, categories present. */
function primeAuthKeyAndCategories() {
  mockGetCurrentContext.mockResolvedValue(mockContext);
  (mockPrisma.household.findUnique as jest.Mock).mockResolvedValue({
    anthropicApiKey: 'sk-ant-test',
  });
  (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValue(CATEGORY_ROWS);
  (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValue({});
  (mockPrisma.budgetCategorizationLog.create as jest.Mock).mockResolvedValue({});
}

let originalEnvKey: string | undefined;

beforeEach(() => {
  jest.resetAllMocks();
  originalEnvKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalEnvKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalEnvKey;
});

describe('POST /api/budget/transactions/suggest — guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (limit above MAX_LIMIT)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await POST(makeRequest({ limit: 1000 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when no Anthropic API key is configured', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No Anthropic API key/i);
  });

  it('falls back to the env var when the household has no stored key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-fallback';
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(CATEGORY_ROWS);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns 400 when there are no budget categories to choose from', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant-test',
    });
    (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No budget categories/i);
  });

  it('returns zeroed counts when there are no uncategorized transactions', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      suggested: 0,
      lowConfidence: 0,
      noMatch: 0,
      errors: 0,
      processed: 0,
    });
    expect(mockCategorize).not.toHaveBeenCalled();
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/budget/transactions/suggest — query scoping', () => {
  it('filters to uncategorized, un-suggested, untagged expenses in the household', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    await POST(makeRequest());
    const call = (mockPrisma.budgetTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        householdId: 'hh-1',
        isDeleted: false,
        type: 'expense',
        categoryId: null,
        suggestedCategoryId: null,
        tags: { none: {} },
      })
    );
    expect(call.take).toBe(8); // DEFAULT_LIMIT
  });

  it('honours an explicit limit and transactionIds filter', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    await POST(makeRequest({ limit: 5, transactionIds: ['tx-a', 'tx-b'] }));
    const call = (mockPrisma.budgetTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(5);
    expect(call.where.id).toEqual({ in: ['tx-a', 'tx-b'] });
  });
});

describe('POST /api/budget/transactions/suggest — per-item decisions', () => {
  it('writes a suggestion + log for a confident match', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-1', amountIls: 120, notes: null, payee: { name: 'Shufersal' } },
    ]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: 'cat-1',
      confidence: 0.92,
      reasoning: 'grocery chain',
      usage: USAGE,
    });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ suggested: 1, processed: 1 });

    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'tx-1' });
    expect(updateCall.data.suggestedCategoryId).toBe('cat-1');
    expect(updateCall.data.suggestionConfidence).toBe(0.92);
    expect(updateCall.data.suggestedAt).toBeInstanceOf(Date);
    // The attempt is stamped alongside the suggestion.
    expect(updateCall.data.categorizationAttemptedAt).toBeInstanceOf(Date);

    const logCall = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0];
    expect(logCall.data).toMatchObject({
      householdId: 'hh-1',
      transactionId: 'tx-1',
      transactionName: 'Shufersal',
      status: 'suggested',
      resultCategoryId: 'cat-1',
      resultCategoryName: 'Groceries',
      confidence: 0.92,
      reasoning: 'grocery chain',
    });
  });

  it('logs low_confidence without writing a suggestion', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-2', amountIls: 30, notes: 'bus', payee: null },
    ]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: 'cat-2',
      confidence: 0.4,
      reasoning: 'maybe transit',
      usage: USAGE,
    });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.data).toMatchObject({ lowConfidence: 1, suggested: 0, processed: 1 });
    // Stamps categorizationAttemptedAt (so the auto pass won't retry) but does
    // NOT attach a suggestion.
    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).toEqual({ categorizationAttemptedAt: expect.any(Date) });

    const logCall = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0];
    expect(logCall.data.status).toBe('low_confidence');
    // Falls back to notes for the display name when there is no payee.
    expect(logCall.data.transactionName).toBe('bus');
    expect(logCall.data.resultCategoryName).toBe('Transit');
  });

  it('logs no_match when the model returns no category', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-3', amountIls: 99, notes: null, payee: null },
    ]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: null,
      confidence: 0,
      reasoning: 'no fit',
      usage: USAGE,
    });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.data).toMatchObject({ noMatch: 1, suggested: 0, processed: 1 });
    // Stamps categorizationAttemptedAt but attaches no suggestion.
    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).toEqual({ categorizationAttemptedAt: expect.any(Date) });

    const logCall = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0];
    expect(logCall.data.status).toBe('no_match');
    expect(logCall.data.resultCategoryId).toBeNull();
    expect(logCall.data.resultCategoryName).toBeNull();
    // Falls back to the default label when neither payee nor notes exist.
    expect(logCall.data.transactionName).toBe('Unknown transaction');
  });

  it('records an error log and increments errors when categorization throws (batch not rejected)', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-4', amountIls: 10, notes: null, payee: { name: 'Boom' } },
    ]);
    mockCategorize.mockRejectedValueOnce(new Error('rate limited'));

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ errors: 1, processed: 1, suggested: 0 });

    const logCall = (mockPrisma.budgetCategorizationLog.create as jest.Mock).mock.calls[0][0];
    expect(logCall.data.status).toBe('error');
    expect(logCall.data.reasoning).toBe('rate limited');
  });

  it('swallows a logging failure in the error path (no 500)', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-5', amountIls: 10, notes: null, payee: { name: 'Boom' } },
    ]);
    mockCategorize.mockRejectedValueOnce(new Error('rate limited'));
    (mockPrisma.budgetCategorizationLog.create as jest.Mock).mockRejectedValueOnce(
      new Error('log write failed')
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.errors).toBe(1);
    spy.mockRestore();
  });

  it('aggregates counts across a mixed batch', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'a', amountIls: 1, notes: null, payee: { name: 'A' } },
      { id: 'b', amountIls: 2, notes: null, payee: { name: 'B' } },
      { id: 'c', amountIls: 3, notes: null, payee: { name: 'C' } },
      { id: 'd', amountIls: 4, notes: null, payee: { name: 'D' } },
    ]);
    mockCategorize
      .mockResolvedValueOnce({ categoryId: 'cat-1', confidence: 0.9, reasoning: 'x', usage: USAGE }) // suggested
      .mockResolvedValueOnce({ categoryId: 'cat-2', confidence: 0.5, reasoning: 'x', usage: USAGE }) // low
      .mockResolvedValueOnce({ categoryId: null, confidence: 0, reasoning: 'x', usage: USAGE }) // no_match
      .mockRejectedValueOnce(new Error('boom')); // error

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.data).toEqual({
      suggested: 1,
      lowConfidence: 1,
      noMatch: 1,
      errors: 1,
      processed: 4,
    });
  });

  it('treats confidence exactly at the threshold (0.6) as suggested', async () => {
    primeAuthKeyAndCategories();
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'tx-6', amountIls: 50, notes: null, payee: { name: 'Edge' } },
    ]);
    mockCategorize.mockResolvedValueOnce({
      categoryId: 'cat-1',
      confidence: 0.6,
      reasoning: 'edge',
      usage: USAGE,
    });

    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.data).toMatchObject({ suggested: 1, lowConfidence: 0 });
  });
});
