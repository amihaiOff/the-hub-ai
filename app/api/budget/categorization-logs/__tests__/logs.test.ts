/**
 * Integration tests for GET /api/budget/categorization-logs.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    budgetCategorizationLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

beforeEach(() => jest.resetAllMocks());

describe('GET /api/budget/categorization-logs', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('scopes to the active household, newest first, capped at 100', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetCategorizationLog.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET();
    expect(mockPrisma.budgetCategorizationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId: 'hh-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    );
  });

  it('maps rows to the public shape with ISO createdAt', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    (mockPrisma.budgetCategorizationLog.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'log-1',
        householdId: 'hh-1',
        transactionId: 'tx-1',
        transactionName: 'Shufersal',
        status: 'suggested',
        resultCategoryId: 'cat-1',
        resultCategoryName: 'Groceries',
        confidence: 0.9,
        reasoning: 'grocery chain',
        createdAt,
      },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      {
        id: 'log-1',
        transactionName: 'Shufersal',
        status: 'suggested',
        resultCategoryName: 'Groceries',
        confidence: 0.9,
        reasoning: 'grocery chain',
        createdAt: '2026-01-02T03:04:05.000Z',
      },
    ]);
    // Internal fields are not leaked.
    expect(json.data[0]).not.toHaveProperty('householdId');
    expect(json.data[0]).not.toHaveProperty('transactionId');
  });

  it('returns an empty list when there are no logs', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetCategorizationLog.findMany as jest.Mock).mockResolvedValueOnce([]);
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ success: true, data: [] });
  });
});
