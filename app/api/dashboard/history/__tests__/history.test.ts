/**
 * Integration tests for /api/dashboard/history route
 * Tests net worth snapshot fetching from database
 */

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    netWorthSnapshot: {
      findMany: jest.fn(),
    },
    stockAccount: {
      findMany: jest.fn(),
    },
    pensionAccount: {
      findMany: jest.fn(),
    },
    miscAsset: {
      findMany: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

// Mock stock price utilities
jest.mock('@/lib/api/stock-price', () => ({
  getStockPrices: jest.fn(),
  isStockPriceError: (result: unknown) =>
    result !== null && typeof result === 'object' && 'error' in result,
}));

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { getStockPrices } from '@/lib/api/stock-price';
import { GET } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetStockPrices = getStockPrices as jest.MockedFunction<typeof getStockPrices>;

describe('Dashboard History API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/dashboard/history', () => {
    it('should return snapshots from database when available', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Mock database snapshots (returned in descending order as DB would with orderBy: desc)
      // API reverses this to get chronological order for the chart
      const mockSnapshots = [
        {
          id: 'snapshot-2',
          userId: 'user-1',
          date: new Date('2024-01-15'),
          netWorth: createDecimal(105000),
          portfolio: createDecimal(42000),
          pension: createDecimal(52000),
          assets: createDecimal(11000),
          createdAt: new Date(),
        },
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(100000),
          portfolio: createDecimal(40000),
          pension: createDecimal(50000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);

      // After reverse(), first snapshot is oldest (Jan 1)
      expect(data.data[0]).toEqual({
        date: '2024-01-01',
        netWorth: 100000,
        portfolio: 40000,
        pension: 50000,
        assets: 10000,
      });

      // Second snapshot is more recent (Jan 15)
      expect(data.data[1]).toEqual({
        date: '2024-01-15',
        netWorth: 105000,
        portfolio: 42000,
        pension: 52000,
        assets: 11000,
      });

      // Verify database query (fetches latest 24 in descending order, then reverses for chronological display)
      expect(mockPrisma.netWorthSnapshot.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { date: 'desc' },
        take: 24,
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should fall back to generated mock data when no snapshots exist', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // No snapshots in database
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Mock current portfolio data for fallback calculation
      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Brokerage',
          broker: 'Fidelity',
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'AAPL',
              quantity: createDecimal(10),
              avgCostBasis: createDecimal(150),
            },
          ],
        },
      ];

      const mockPensionAccounts = [
        {
          id: 'pension-1',
          name: 'Retirement Fund',
          currentValue: createDecimal(50000),
          userId: 'user-1',
        },
      ];

      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: createDecimal(10000),
          userId: 'user-1',
        },
      ];

      const stockPrices = new Map([
        [
          'AAPL',
          { symbol: 'AAPL', price: 175, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockPensionAccounts);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Mock history generates 24 bi-weekly data points
      expect(data.data).toHaveLength(24);
      // Last data point should have current date
      const lastPoint = data.data[data.data.length - 1];
      expect(lastPoint.date).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should handle empty portfolio/pension/assets in fallback mode', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(24);

      // Last point should have zero values
      const lastPoint = data.data[data.data.length - 1];
      expect(lastPoint.netWorth).toBe(0);
      expect(lastPoint.portfolio).toBe(0);
      expect(lastPoint.pension).toBe(0);
      expect(lastPoint.assets).toBe(0);
    });

    it('should handle snapshots with negative asset values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(-200000),
          portfolio: createDecimal(50000),
          pension: createDecimal(100000),
          assets: createDecimal(-350000), // Net debt
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data[0].netWorth).toBe(-200000);
      expect(data.data[0].assets).toBe(-350000);
    });

    it('should handle very large snapshot values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(50000000), // 50 million
          portfolio: createDecimal(20000000),
          pension: createDecimal(25000000),
          assets: createDecimal(5000000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].netWorth).toBe(50000000);
      expect(data.data[0].portfolio).toBe(20000000);
      expect(data.data[0].pension).toBe(25000000);
      expect(data.data[0].assets).toBe(5000000);
    });

    it('should handle zero values in snapshots', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(0),
          portfolio: createDecimal(0),
          pension: createDecimal(0),
          assets: createDecimal(0),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].netWorth).toBe(0);
      expect(data.data[0].portfolio).toBe(0);
      expect(data.data[0].pension).toBe(0);
      expect(data.data[0].assets).toBe(0);
    });

    it('should return snapshots in ascending date order (after reversing DB desc order)', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Mock returns descending order as DB would with orderBy: { date: 'desc' }
      // The API reverses this to get chronological order for the chart
      const mockSnapshots = [
        {
          id: 'snapshot-3',
          userId: 'user-1',
          date: new Date('2024-03-01'),
          netWorth: createDecimal(120000),
          portfolio: createDecimal(50000),
          pension: createDecimal(60000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
        {
          id: 'snapshot-2',
          userId: 'user-1',
          date: new Date('2024-02-01'),
          netWorth: createDecimal(110000),
          portfolio: createDecimal(45000),
          pension: createDecimal(55000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(100000),
          portfolio: createDecimal(40000),
          pension: createDecimal(50000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // After reverse(), dates should be in ascending order for the chart
      expect(data.data[0].date).toBe('2024-01-01');
      expect(data.data[1].date).toBe('2024-02-01');
      expect(data.data[2].date).toBe('2024-03-01');
    });

    it('should limit to 24 snapshots', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      await GET();

      expect(mockPrisma.netWorthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 24,
        })
      );
    });

    it('should handle database error gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch net worth history');
    });

    it('should format date as ISO date string (YYYY-MM-DD)', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const testDate = new Date('2024-06-15T12:30:45.000Z');
      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: testDate,
          netWorth: createDecimal(100000),
          portfolio: createDecimal(40000),
          pension: createDecimal(50000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].date).toBe('2024-06-15');
    });

    it('should only return snapshots for the authenticated user', async () => {
      const mockUser = { id: 'user-specific', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      await GET();

      expect(mockPrisma.netWorthSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-specific' },
        })
      );
    });

    it('should verify net worth equals portfolio + pension + assets in snapshots', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const portfolio = 45000;
      const pension = 55000;
      const assets = -10000; // Net debt
      const netWorth = portfolio + pension + assets; // 90000

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(netWorth),
          portfolio: createDecimal(portfolio),
          pension: createDecimal(pension),
          assets: createDecimal(assets),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      const snapshot = data.data[0];
      expect(snapshot.netWorth).toBe(snapshot.portfolio + snapshot.pension + snapshot.assets);
      expect(snapshot.netWorth).toBe(90000);
    });

    it('should handle decimal precision correctly', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(100000.99),
          portfolio: createDecimal(40000.5),
          pension: createDecimal(50000.25),
          assets: createDecimal(10000.24),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Values should be converted to numbers correctly
      expect(typeof data.data[0].netWorth).toBe('number');
      expect(typeof data.data[0].portfolio).toBe('number');
      expect(data.data[0].netWorth).toBeCloseTo(100000.99);
      expect(data.data[0].portfolio).toBeCloseTo(40000.5);
    });
  });
});
