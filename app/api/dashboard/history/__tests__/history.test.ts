/**
 * Integration tests for /api/dashboard/history route
 * Tests net worth snapshot fetching from database.
 *
 * Key behavior: the route always computes real-time "today" values via
 * computeCurrentValues and appends them as the last data point, even when
 * DB snapshots exist.
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
    result !== null && typeof result === 'object' && 'error' in (result as Record<string, unknown>),
}));

// Mock exchange-rates module - return null so convertSummaryToILS is not called
jest.mock('@/lib/api/exchange-rates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue(null),
  convertPrice: jest.fn((price: number) => price),
}));

// Mock portfolio utilities - return a simple summary based on the accounts passed in
jest.mock('@/lib/utils/portfolio', () => ({
  calculatePortfolioSummary: jest.fn(
    (
      accounts: Array<{
        holdings: Array<{ currentPrice: number; quantity: { toNumber?: () => number } }>;
      }>
    ) => {
      let totalValue = 0;
      let totalCostBasis = 0;
      let totalHoldings = 0;
      for (const account of accounts) {
        for (const h of account.holdings) {
          const qty =
            typeof h.quantity === 'object' && h.quantity.toNumber
              ? h.quantity.toNumber()
              : Number(h.quantity);
          totalValue += qty * Number(h.currentPrice);
          totalCostBasis += qty * Number(h.currentPrice); // simplified
          totalHoldings++;
        }
      }
      return {
        totalValue,
        totalHoldingsValue: totalValue,
        totalCash: 0,
        totalCostBasis,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        totalHoldings,
        accounts: [],
      };
    }
  ),
  convertSummaryToILS: jest.fn((summary: { totalValue: number }) => summary),
  HoldingWithPrice: undefined,
}));

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { getStockPrices } from '@/lib/api/stock-price';
import { GET } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetStockPrices = getStockPrices as jest.MockedFunction<typeof getStockPrices>;

/**
 * Helper: mock computeCurrentValues dependencies to return zero-value results.
 * Must be called for every test that reaches computeCurrentValues (all authenticated tests).
 */
function mockEmptyCurrentValues() {
  (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
  (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
  (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
  mockGetStockPrices.mockResolvedValueOnce(new Map());
}

/**
 * Helper: mock computeCurrentValues to return specific portfolio/pension/assets values.
 */
function mockCurrentValues(opts: {
  stockAccounts?: Array<Record<string, unknown>>;
  pensionAccounts?: Array<Record<string, unknown>>;
  miscAssets?: Array<Record<string, unknown>>;
  stockPrices?: Map<string, unknown>;
}) {
  (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(opts.stockAccounts ?? []);
  (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(
    opts.pensionAccounts ?? []
  );
  (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(opts.miscAssets ?? []);
  mockGetStockPrices.mockResolvedValueOnce(
    (opts.stockPrices as Map<
      string,
      { symbol: string; price: number; currency: string; timestamp: Date; fromCache: boolean }
    >) ?? new Map()
  );
}

const todayStr = new Date().toISOString().split('T')[0];

describe('Dashboard History API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Re-apply exchange rates mock after reset
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetchExchangeRates } = require('@/lib/api/exchange-rates');
    (fetchExchangeRates as jest.Mock).mockResolvedValue(null);

    // Re-apply portfolio utilities mock after reset
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { calculatePortfolioSummary, convertSummaryToILS } = require('@/lib/utils/portfolio');
    (calculatePortfolioSummary as jest.Mock).mockImplementation(
      (
        accounts: Array<{
          holdings: Array<{ currentPrice: number; quantity: { toNumber?: () => number } }>;
        }>
      ) => {
        let totalValue = 0;
        let totalCostBasis = 0;
        let totalHoldings = 0;
        for (const account of accounts) {
          for (const h of account.holdings) {
            const qty =
              typeof h.quantity === 'object' && h.quantity.toNumber
                ? h.quantity.toNumber()
                : Number(h.quantity);
            totalValue += qty * Number(h.currentPrice);
            totalCostBasis += qty * Number(h.currentPrice);
            totalHoldings++;
          }
        }
        return {
          totalValue,
          totalHoldingsValue: totalValue,
          totalCash: 0,
          totalCostBasis,
          totalGainLoss: 0,
          totalGainLossPercent: 0,
          totalHoldings,
          accounts: [],
        };
      }
    );
    (convertSummaryToILS as jest.Mock).mockImplementation(
      (summary: { totalValue: number }) => summary
    );
  });

  describe('GET /api/dashboard/history', () => {
    it('should return snapshots from database with a today data point appended', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Mock database snapshots (returned in descending order as DB would with orderBy: desc)
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
      // computeCurrentValues is called first (before snapshot check)
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // 2 DB snapshots + 1 appended today point = 3
      expect(data.data).toHaveLength(3);

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

      // Third is the live "today" data point (empty current values => zeros)
      expect(data.data[2].date).toBe(todayStr);

      // Verify database query
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

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      // computeCurrentValues mocks
      mockCurrentValues({
        stockAccounts: mockStockAccounts,
        pensionAccounts: mockPensionAccounts,
        miscAssets: mockAssets,
        stockPrices,
      });
      // No snapshots in database
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Mock history generates 24 bi-weekly data points
      expect(data.data).toHaveLength(24);
      // Last data point should have current date
      const lastPoint = data.data[data.data.length - 1];
      expect(lastPoint.date).toBe(todayStr);
    });

    it('should handle empty portfolio/pension/assets in fallback mode', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      // computeCurrentValues with empty data
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

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
      mockEmptyCurrentValues();
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
      mockEmptyCurrentValues();
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
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].netWorth).toBe(0);
      expect(data.data[0].portfolio).toBe(0);
      expect(data.data[0].pension).toBe(0);
      expect(data.data[0].assets).toBe(0);
    });

    it('should return snapshots in ascending date order with today appended', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Mock returns descending order as DB would with orderBy: { date: 'desc' }
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
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // After reverse(), dates should be in ascending order, plus today appended
      expect(data.data[0].date).toBe('2024-01-01');
      expect(data.data[1].date).toBe('2024-02-01');
      expect(data.data[2].date).toBe('2024-03-01');
      // Today is appended as last point
      expect(data.data[3].date).toBe(todayStr);
      expect(data.data).toHaveLength(4);
    });

    it('should limit to 24 snapshots', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockEmptyCurrentValues();
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
      // computeCurrentValues will fail if stockAccount.findMany rejects
      (mockPrisma.stockAccount.findMany as jest.Mock).mockRejectedValueOnce(
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
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].date).toBe('2024-06-15');
    });

    it('should only return snapshots for the authenticated user', async () => {
      const mockUser = { id: 'user-specific', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockEmptyCurrentValues();
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
      mockEmptyCurrentValues();
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
      mockEmptyCurrentValues();
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

    it('should replace today point instead of appending when last snapshot is today', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Create a snapshot with today's date
      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date(), // today
          netWorth: createDecimal(100000),
          portfolio: createDecimal(40000),
          pension: createDecimal(50000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockEmptyCurrentValues();
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should NOT append an extra point; instead, the today snapshot is replaced
      expect(data.data).toHaveLength(1);
      expect(data.data[0].date).toBe(todayStr);
      // The values come from computeCurrentValues (empty => 0), not the DB snapshot
      expect(data.data[0].netWorth).toBe(0);
      expect(data.data[0].portfolio).toBe(0);
    });

    it('should append today point with real-time computed values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Set up current values: 1 stock account with known price
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
          name: 'Fund',
          currentValue: createDecimal(50000),
          userId: 'user-1',
        },
      ];

      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: createDecimal(20000),
          userId: 'user-1',
        },
      ];

      const stockPrices = new Map([
        [
          'AAPL',
          { symbol: 'AAPL', price: 200, currency: 'USD', timestamp: new Date(), fromCache: false },
        ],
      ]);

      // One old snapshot
      const mockSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(80000),
          portfolio: createDecimal(30000),
          pension: createDecimal(40000),
          assets: createDecimal(10000),
          createdAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockCurrentValues({
        stockAccounts: mockStockAccounts,
        pensionAccounts: mockPensionAccounts,
        miscAssets: mockAssets,
        stockPrices,
      });
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(mockSnapshots);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);

      // First point: historical snapshot
      expect(data.data[0].date).toBe('2024-01-01');
      expect(data.data[0].netWorth).toBe(80000);

      // Second point: today's real-time values
      const todayPoint = data.data[1];
      expect(todayPoint.date).toBe(todayStr);
      // Portfolio: calculatePortfolioSummary mock => 10 * 200 = 2000
      // Pension: 50000, Assets: 20000
      // Net worth: 2000 + 50000 + 20000 = 72000
      expect(todayPoint.portfolio).toBe(2000);
      expect(todayPoint.pension).toBe(50000);
      expect(todayPoint.assets).toBe(20000);
      expect(todayPoint.netWorth).toBe(72000);
    });
  });
});
