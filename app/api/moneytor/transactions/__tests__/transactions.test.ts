/**
 * Integration tests for /api/moneytor/transactions route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

const syncedAt = new Date('2026-06-12T10:00:00.000Z');

const mockTransactionRow = {
  id: 'tx-1',
  transactionDate: new Date('2026-06-01'),
  amount: 150.5,
  currency: 'ILS',
  description: 'Supermarket',
  category: 'Food',
  accountId: 'acct-1',
  type: 'expense',
  syncedAt,
  householdId: 'household-1',
};

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('GET /api/moneytor/transactions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET(makeRequest('http://localhost/api/moneytor/transactions'));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return transactions with no filters', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([mockTransactionRow])
      .mockResolvedValueOnce([{ category: 'Food' }]); // categories
    (mockPrisma.moneytorTransaction.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue({ syncedAt });

    const response = await GET(makeRequest('http://localhost/api/moneytor/transactions'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.transactions).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.categories).toEqual(['Food']);
    expect(data.latestSyncedAt).toBe(syncedAt.toISOString());
  });

  it('should filter by month', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([mockTransactionRow])
      .mockResolvedValueOnce([]);
    (mockPrisma.moneytorTransaction.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      makeRequest('http://localhost/api/moneytor/transactions?month=2026-06')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify the findMany was called with date range filter
    const findManyCall = (mockPrisma.moneytorTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.transactionDate).toBeDefined();
  });

  it('should filter by category', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([mockTransactionRow])
      .mockResolvedValueOnce([{ category: 'Food' }]);
    (mockPrisma.moneytorTransaction.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      makeRequest('http://localhost/api/moneytor/transactions?category=Food')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const findManyCall = (mockPrisma.moneytorTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.category).toBe('Food');
  });

  it('should filter by type and search', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([mockTransactionRow])
      .mockResolvedValueOnce([]);
    (mockPrisma.moneytorTransaction.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      makeRequest('http://localhost/api/moneytor/transactions?type=expense&search=super')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    const findManyCall = (mockPrisma.moneytorTransaction.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.type).toBe('expense');
    expect(findManyCall.where.description).toBeDefined();
  });

  it('should return null latestSyncedAt when no transactions', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (mockPrisma.moneytorTransaction.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await GET(makeRequest('http://localhost/api/moneytor/transactions'));
    const data = await response.json();

    expect(data.latestSyncedAt).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest('http://localhost/api/moneytor/transactions'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
