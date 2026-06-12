/**
 * Integration tests for DELETE /api/moneytor/stocks/[productId] route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    moneytorStockHolding: {
      deleteMany: jest.fn(),
    },
    moneytorStockSnapshot: {
      deleteMany: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { DELETE } from '../route';

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

describe('DELETE /api/moneytor/stocks/[productId]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/moneytor/stocks/prod-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ productId: 'prod-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it('should delete holdings and snapshots successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      { count: 5 }, // holdings deleted
      { count: 10 }, // snapshots deleted
    ]);

    const request = new NextRequest('http://localhost/api/moneytor/stocks/prod-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ productId: 'prod-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.deletedHoldings).toBe(5);
    expect(data.deletedSnapshots).toBe(10);
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost/api/moneytor/stocks/prod-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ productId: 'prod-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
