/**
 * Integration tests for /api/dashboard route
 * Tests net worth aggregation from stocks, pension, and assets
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
  // Use actual implementation for type guard
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

describe('Dashboard API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/dashboard', () => {
    it('should return aggregated dashboard data with correct net worth', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      // Mock stock accounts with holdings
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
            {
              id: 'holding-2',
              symbol: 'GOOGL',
              quantity: createDecimal(5),
              avgCostBasis: createDecimal(100),
            },
          ],
        },
      ];

      // Mock pension accounts
      const mockPensionAccounts = [
        {
          id: 'pension-1',
          name: 'Retirement Fund',
          currentValue: createDecimal(50000),
          userId: 'user-1',
        },
        {
          id: 'pension-2',
          name: 'Hishtalmut',
          currentValue: createDecimal(25000),
          userId: 'user-1',
        },
      ];

      // Mock misc assets
      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: createDecimal(10000),
          userId: 'user-1',
        },
        {
          id: 'asset-2',
          type: 'loan',
          name: 'Car Loan',
          currentValue: createDecimal(-5000),
          userId: 'user-1',
        },
      ];

      // Mock stock prices: AAPL=$175, GOOGL=$140
      const stockPrices = new Map([
        [
          'AAPL',
          { symbol: 'AAPL', price: 175, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
        [
          'GOOGL',
          { symbol: 'GOOGL', price: 140, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockPensionAccounts);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Portfolio: (10 * 175) + (5 * 140) = 1750 + 700 = 2450
      expect(data.data.portfolio.totalValue).toBe(2450);
      expect(data.data.portfolio.holdingsCount).toBe(2);

      // Portfolio gain/loss: 2450 - ((10 * 150) + (5 * 100)) = 2450 - 2000 = 450
      expect(data.data.portfolio.totalGain).toBe(450);
      expect(data.data.portfolio.totalGainPercent).toBeCloseTo(22.5); // 450/2000 * 100

      // Pension: 50000 + 25000 = 75000
      expect(data.data.pension.totalValue).toBe(75000);
      expect(data.data.pension.accountsCount).toBe(2);

      // Assets: totalAssets=10000, totalLiabilities=5000, netValue=5000
      expect(data.data.assets.totalAssets).toBe(10000);
      expect(data.data.assets.totalLiabilities).toBe(5000);
      expect(data.data.assets.netValue).toBe(5000);
      expect(data.data.assets.itemsCount).toBe(2);

      // Net worth: 2450 + 75000 + 5000 = 82450
      expect(data.data.netWorth).toBe(82450);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle empty portfolio, pension, and assets', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.netWorth).toBe(0);
      expect(data.data.portfolio.totalValue).toBe(0);
      expect(data.data.portfolio.holdingsCount).toBe(0);
      expect(data.data.pension.totalValue).toBe(0);
      expect(data.data.pension.accountsCount).toBe(0);
      expect(data.data.assets.netValue).toBe(0);
      expect(data.data.assets.itemsCount).toBe(0);
    });

    it('should handle stocks with missing prices (default to 0)', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

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
              symbol: 'UNKNOWN',
              quantity: createDecimal(100),
              avgCostBasis: createDecimal(50),
            },
          ],
        },
      ];

      // Return error for unknown symbol
      const stockPrices = new Map([
        ['UNKNOWN', { symbol: 'UNKNOWN', error: 'Unable to fetch stock price' }],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Price defaults to 0 when error
      expect(data.data.portfolio.totalValue).toBe(0);
      expect(data.data.portfolio.holdingsCount).toBe(1);
    });

    it('should handle only liabilities (negative net worth from assets)', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockAssets = [
        {
          id: 'asset-1',
          type: 'mortgage',
          name: 'Home Mortgage',
          currentValue: createDecimal(-300000),
          userId: 'user-1',
        },
        {
          id: 'asset-2',
          type: 'loan',
          name: 'Car Loan',
          currentValue: createDecimal(-25000),
          userId: 'user-1',
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);
      mockGetStockPrices.mockResolvedValueOnce(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.assets.totalAssets).toBe(0);
      expect(data.data.assets.totalLiabilities).toBe(325000);
      expect(data.data.assets.netValue).toBe(-325000);
      expect(data.data.netWorth).toBe(-325000);
    });

    it('should calculate net worth correctly with all positive values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Brokerage',
          broker: null,
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'VTI',
              quantity: createDecimal(50),
              avgCostBasis: createDecimal(200),
            },
          ],
        },
      ];

      const mockPensionAccounts = [
        {
          id: 'pension-1',
          name: 'IRA',
          currentValue: createDecimal(100000),
          userId: 'user-1',
        },
      ];

      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Emergency Fund',
          currentValue: createDecimal(20000),
          userId: 'user-1',
        },
      ];

      const stockPrices = new Map([
        [
          'VTI',
          { symbol: 'VTI', price: 250, currency: 'USD', timestamp: new Date(), fromCache: false },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockPensionAccounts);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Portfolio: 50 * 250 = 12500
      expect(data.data.portfolio.totalValue).toBe(12500);
      // Pension: 100000
      expect(data.data.pension.totalValue).toBe(100000);
      // Assets net: 20000
      expect(data.data.assets.netValue).toBe(20000);
      // Net worth: 12500 + 100000 + 20000 = 132500
      expect(data.data.netWorth).toBe(132500);
    });

    it('should handle multiple stock accounts', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Taxable',
          broker: 'Vanguard',
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'AAPL',
              quantity: createDecimal(10),
              avgCostBasis: createDecimal(100),
            },
          ],
        },
        {
          id: 'account-2',
          name: 'IRA',
          broker: 'Fidelity',
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-2',
              symbol: 'AAPL',
              quantity: createDecimal(20),
              avgCostBasis: createDecimal(120),
            },
            {
              id: 'holding-3',
              symbol: 'MSFT',
              quantity: createDecimal(15),
              avgCostBasis: createDecimal(200),
            },
          ],
        },
      ];

      const stockPrices = new Map([
        [
          'AAPL',
          { symbol: 'AAPL', price: 150, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
        [
          'MSFT',
          { symbol: 'MSFT', price: 350, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Account 1: 10 * 150 = 1500
      // Account 2: (20 * 150) + (15 * 350) = 3000 + 5250 = 8250
      // Total: 1500 + 8250 = 9750
      expect(data.data.portfolio.totalValue).toBe(9750);
      expect(data.data.portfolio.holdingsCount).toBe(3);
    });

    it('should handle fractional share quantities', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Brokerage',
          broker: null,
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'AMZN',
              quantity: createDecimal(0.5),
              avgCostBasis: createDecimal(3000),
            },
          ],
        },
      ];

      const stockPrices = new Map([
        [
          'AMZN',
          { symbol: 'AMZN', price: 3200, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Portfolio: 0.5 * 3200 = 1600
      expect(data.data.portfolio.totalValue).toBe(1600);
      // Gain: 1600 - (0.5 * 3000) = 1600 - 1500 = 100
      expect(data.data.portfolio.totalGain).toBe(100);
    });

    it('should handle zero-value assets correctly', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Empty Account',
          currentValue: createDecimal(0),
          userId: 'user-1',
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);
      mockGetStockPrices.mockResolvedValueOnce(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Zero is treated as a positive asset (>= 0)
      expect(data.data.assets.totalAssets).toBe(0);
      expect(data.data.assets.totalLiabilities).toBe(0);
      expect(data.data.assets.netValue).toBe(0);
      expect(data.data.assets.itemsCount).toBe(1);
    });

    it('should handle database error gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch dashboard data');
    });

    it('should handle very large portfolio values', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Whale Portfolio',
          broker: null,
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'BRK.A',
              quantity: createDecimal(10),
              avgCostBasis: createDecimal(400000),
            },
          ],
        },
      ];

      const stockPrices = new Map([
        [
          'BRK.A',
          {
            symbol: 'BRK.A',
            price: 500000,
            currency: 'USD',
            timestamp: new Date(),
            fromCache: true,
          },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Portfolio: 10 * 500000 = 5,000,000
      expect(data.data.portfolio.totalValue).toBe(5000000);
      expect(data.data.netWorth).toBe(5000000);
    });

    it('should handle stock account with no holdings', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Empty Brokerage',
          broker: 'Schwab',
          currency: 'USD',
          userId: 'user-1',
          holdings: [],
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.portfolio.totalValue).toBe(0);
      expect(data.data.portfolio.holdingsCount).toBe(0);
    });

    it('should calculate negative gain/loss correctly', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

      const mockStockAccounts = [
        {
          id: 'account-1',
          name: 'Losing Portfolio',
          broker: null,
          currency: 'USD',
          userId: 'user-1',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'LOSER',
              quantity: createDecimal(100),
              avgCostBasis: createDecimal(100),
            },
          ],
        },
      ];

      const stockPrices = new Map([
        [
          'LOSER',
          { symbol: 'LOSER', price: 50, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      mockGetStockPrices.mockResolvedValueOnce(stockPrices);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Portfolio: 100 * 50 = 5000
      expect(data.data.portfolio.totalValue).toBe(5000);
      // Cost basis: 100 * 100 = 10000
      // Gain: 5000 - 10000 = -5000
      expect(data.data.portfolio.totalGain).toBe(-5000);
      // Gain %: -5000 / 10000 * 100 = -50%
      expect(data.data.portfolio.totalGainPercent).toBe(-50);
    });
  });
});
