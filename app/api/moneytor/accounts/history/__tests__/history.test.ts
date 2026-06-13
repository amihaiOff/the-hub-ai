/**
 * Integration tests for GET /api/moneytor/accounts/history route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorAccountSnapshot: {
      findMany: jest.fn(),
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

function makeRequest(range?: string) {
  const url = range
    ? `http://localhost/api/moneytor/accounts/history?range=${range}`
    : 'http://localhost/api/moneytor/accounts/history';
  return new NextRequest(url);
}

describe('GET /api/moneytor/accounts/history', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return empty history when no snapshots exist', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(makeRequest('1Y'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.points).toHaveLength(0);
    expect(data.accounts).toHaveLength(0);
    expect(data.range).toBe('1Y');
  });

  it('should aggregate snapshots by date and account', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const snapshotDate1 = new Date('2026-06-01');
    const snapshotDate2 = new Date('2026-06-02');

    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValue([
      {
        snapshotDate: snapshotDate1,
        productId: 'prod-1',
        form: 'bank',
        name: 'Checking',
        balanceInBase: 10000,
      },
      {
        snapshotDate: snapshotDate2,
        productId: 'prod-1',
        form: 'bank',
        name: 'Checking',
        balanceInBase: 10500,
      },
    ]);

    const response = await GET(makeRequest('1M'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].productId).toBe('prod-1');
    expect(data.accounts[0].points).toHaveLength(2);
    expect(data.points).toHaveLength(2);
  });

  it('should sum multiple accounts for aggregate points', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const snapshotDate = new Date('2026-06-01');

    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValue([
      { snapshotDate, productId: 'prod-1', form: 'bank', name: 'Checking', balanceInBase: 10000 },
      { snapshotDate, productId: 'prod-2', form: 'debt', name: 'Loan', balanceInBase: -5000 },
    ]);

    const response = await GET(makeRequest('3M'));
    const data = await response.json();

    expect(data.accounts).toHaveLength(2);
    expect(data.points).toHaveLength(1);
    expect(data.points[0].value).toBe(5000); // 10000 + (-5000)
  });

  it('should use default range of 1Y when no range specified', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.range).toBe('1Y');

    // Verify snapshotDate filter was applied (not ALL range)
    const findManyCall = (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mock
      .calls[0][0];
    expect(findManyCall.where.snapshotDate).toBeDefined();
  });

  it('should return all history for ALL range without date filter', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(makeRequest('ALL'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.range).toBe('ALL');

    const findManyCall = (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mock
      .calls[0][0];
    expect(findManyCall.where.snapshotDate).toBeUndefined();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockRejectedValue(
      new Error('DB error')
    );

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
