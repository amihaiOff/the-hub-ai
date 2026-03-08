/**
 * Integration tests for /api/budget/transactions/counts route
 * Tests the uncategorized transaction count endpoint with authentication and authorization
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTransaction: {
      count: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createRequest(month?: string): NextRequest {
  const url = month
    ? `http://localhost/api/budget/transactions/counts?month=${month}`
    : 'http://localhost/api/budget/transactions/counts';
  return new NextRequest(url);
}

describe('Transaction Counts API', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      userId: 'user-1',
    },
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

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/budget/transactions/counts', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('should return uncategorized count of 0 when all transactions have categories', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(0);

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ uncategorized: 0 });
    });

    it('should return the correct uncategorized count', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(42);

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ uncategorized: 42 });
    });

    it('should filter by householdId and null categoryId without month', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(5);

      await GET(createRequest());

      expect(mockPrisma.budgetTransaction.count).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: null,
        },
      });
    });

    it('should filter by month when provided', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(7);

      const response = await GET(createRequest('2026-03'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ uncategorized: 7 });
      expect(mockPrisma.budgetTransaction.count).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: null,
          transactionDate: {
            gte: new Date(2026, 2, 1),
            lt: new Date(2026, 3, 1),
          },
        },
      });
    });

    it('should handle December month with year rollover for endDate', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(2);

      const response = await GET(createRequest('2025-12'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ uncategorized: 2 });
      expect(mockPrisma.budgetTransaction.count).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: null,
          transactionDate: {
            gte: new Date(2025, 11, 1),
            lt: new Date(2026, 0, 1),
          },
        },
      });
    });

    it('should handle January month correctly', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(1);

      const response = await GET(createRequest('2026-01'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ uncategorized: 1 });
      expect(mockPrisma.budgetTransaction.count).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: null,
          transactionDate: {
            gte: new Date(2026, 0, 1),
            lt: new Date(2026, 1, 1),
          },
        },
      });
    });

    it('should return 400 for invalid month format', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await GET(createRequest('invalid'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid month format (YYYY-MM)');
      expect(mockPrisma.budgetTransaction.count).not.toHaveBeenCalled();
    });

    it('should use the active household from context', async () => {
      const altContext = {
        ...mockContext,
        activeHousehold: {
          id: 'household-99',
          name: 'Other Household',
          description: null,
          role: 'owner' as const,
        },
      };
      mockGetCurrentContext.mockResolvedValue(altContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(3);

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ uncategorized: 3 });
      expect(mockPrisma.budgetTransaction.count).toHaveBeenCalledWith({
        where: {
          householdId: 'household-99',
          categoryId: null,
        },
      });
    });

    it('should handle large uncategorized counts', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValue(10000);

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ uncategorized: 10000 });
    });

    it('should handle database errors gracefully and return 500', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await GET(createRequest());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to fetch transaction counts');
    });
  });
});
