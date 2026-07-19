/**
 * Coverage-lift tests for /api/labs/ai-usage.
 *
 * The route aggregates AI auto-categorization spend from
 * `budget_categorization_logs`. The branch-heavy paths are:
 *   - `bucket = byMonth.get(key) ?? { … }` create-vs-hit
 *   - `r.inputTokens ?? 0` (and siblings) null-vs-value
 *   - `current.count > 0 ? avg : 0` divide-by-zero guard
 *   - the empty-response case when no rows exist
 *
 * Two happy-path tests exercise all of these plus the auth check.
 */

jest.mock('@/lib/auth-utils', () => ({ getCurrentContext: jest.fn() }));
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetCategorizationLog: { findMany: jest.fn() },
  },
}));

import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { GET } from '../route';

const mockContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockFindMany = prisma.budgetCategorizationLog.findMany as jest.Mock;

const contextStub = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  profile: { id: 'p1', name: 'Test', image: null, color: null, userId: 'user-1' },
  households: [{ id: 'h1', name: 'H', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'h1', name: 'H', description: null, role: 'owner' as const },
  householdProfiles: [
    { id: 'p1', name: 'Test', image: null, color: null, role: 'owner' as const, hasUser: true },
  ],
};

describe('GET /api/labs/ai-usage', () => {
  beforeEach(() => {
    mockContext.mockReset();
    mockFindMany.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns zero-state when no usage rows exist', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currentMonth.spendUsd).toBe(0);
    expect(body.data.currentMonth.transactionCount).toBe(0);
    expect(body.data.currentMonth.avgCostUsd).toBe(0); // divide-by-zero guard
    expect(body.data.months).toHaveLength(6);
    for (const m of body.data.months) {
      expect(m.spendUsd).toBe(0);
      expect(m.transactionCount).toBe(0);
    }
  });

  it('aggregates counts + tokens for the current month', async () => {
    const now = new Date();
    mockContext.mockResolvedValueOnce(contextStub);
    mockFindMany.mockResolvedValueOnce([
      {
        createdAt: now,
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 200,
        cacheReadTokens: 100,
        webSearches: 2,
      },
      {
        createdAt: now,
        inputTokens: 400,
        outputTokens: 300,
        cacheCreationTokens: null, // exercises `?? 0`
        cacheReadTokens: null,
        webSearches: null,
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.currentMonth.transactionCount).toBe(2);
    expect(body.data.currentMonth.tokens.input).toBe(1400);
    expect(body.data.currentMonth.tokens.output).toBe(800);
    expect(body.data.currentMonth.tokens.cacheCreation).toBe(200);
    expect(body.data.currentMonth.tokens.webSearches).toBe(2);
    // avgCostUsd should be totalUsd / 2 when count is nonzero.
    expect(body.data.currentMonth.avgCostUsd).toBeCloseTo(body.data.currentMonth.spendUsd / 2);
  });
});
