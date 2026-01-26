/**
 * Integration tests for /api/portfolio endpoint
 * Tests portfolio summary fetching
 */

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma client
const mockPrisma = {
  stockAccount: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

// Mock stock-price module
const mockGetStockPrices = jest.fn();
const mockIsStockPriceError = jest.fn();

jest.mock('@/lib/api/stock-price', () => ({
  getStockPrices: (...args: unknown[]) => mockGetStockPrices(...args),
  isStockPriceError: (result: unknown) => mockIsStockPriceError(result),
}));

// Mock portfolio utility
jest.mock('@/lib/utils/portfolio', () => ({
  calculatePortfolioSummary: jest.fn((accounts) => ({
    totalValue: accounts.reduce(
      (sum: number, acc: { holdings: { currentPrice: number; quantity: number }[] }) =>
        sum +
        acc.holdings.reduce(
          (hSum: number, h: { currentPrice: number; quantity: number }) =>
            hSum + h.currentPrice * h.quantity,
          0
        ),
      0
    ),
    accounts,
  })),
}));

// Mock global fetch for exchange rates
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { GET } from '../route';

// Helper to create mock exchange rate response
function createExchangeRateResponse(rate: number) {
  return {
    ok: true,
    json: async () => ({
      chart: {
        result: [{ meta: { regularMarketPrice: rate } }],
      },
    }),
  };
}

describe('Portfolio API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default mock for exchange rates (returns valid rates)
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('USDILS')) return Promise.resolve(createExchangeRateResponse(3.6));
      if (url.includes('EURILS')) return Promise.resolve(createExchangeRateResponse(3.9));
      if (url.includes('GBPILS')) return Promise.resolve(createExchangeRateResponse(4.5));
      return Promise.resolve({ ok: false });
    });
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  describe('GET /api/portfolio', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns empty data when no accounts exist', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findMany.mockResolvedValue([]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-123');
    });

    it('returns portfolio summary with accounts', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findMany.mockResolvedValue([
        {
          id: 'account-1',
          name: 'Main Account',
          broker: 'Broker A',
          currency: 'USD',
          holdings: [
            {
              id: 'holding-1',
              symbol: 'AAPL',
              quantity: 10,
              avgCostBasis: 150,
            },
            {
              id: 'holding-2',
              symbol: 'GOOGL',
              quantity: 5,
              avgCostBasis: 130,
            },
          ],
          cashBalances: [],
          owners: [
            {
              profile: {
                id: 'profile-1',
                name: 'Test User',
                image: null,
                color: '#3b82f6',
              },
            },
          ],
        },
      ]);

      const pricesMap = new Map([
        [
          'AAPL',
          { symbol: 'AAPL', price: 175, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
        [
          'GOOGL',
          { symbol: 'GOOGL', price: 145, currency: 'USD', timestamp: new Date(), fromCache: true },
        ],
      ]);
      mockGetStockPrices.mockResolvedValue(pricesMap);
      mockIsStockPriceError.mockReturnValue(false);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-123');
    });

    it('fetches prices for all unique symbols', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findMany.mockResolvedValue([
        {
          id: 'account-1',
          name: 'Account 1',
          broker: 'Broker A',
          currency: 'USD',
          holdings: [
            { id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 150 },
            { id: 'h2', symbol: 'MSFT', quantity: 5, avgCostBasis: 300 },
          ],
          cashBalances: [],
          owners: [],
        },
        {
          id: 'account-2',
          name: 'Account 2',
          broker: 'Broker B',
          currency: 'USD',
          holdings: [
            { id: 'h3', symbol: 'AAPL', quantity: 20, avgCostBasis: 160 },
            { id: 'h4', symbol: 'GOOGL', quantity: 3, avgCostBasis: 140 },
          ],
          cashBalances: [],
          owners: [],
        },
      ]);

      mockGetStockPrices.mockResolvedValue(new Map());
      mockIsStockPriceError.mockReturnValue(false);

      await GET();

      expect(mockGetStockPrices).toHaveBeenCalledWith(
        expect.arrayContaining(['AAPL', 'MSFT', 'GOOGL'])
      );
      // Should have exactly 3 unique symbols
      expect(mockGetStockPrices.mock.calls[0][0]).toHaveLength(3);
    });

    it('handles price fetch errors gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findMany.mockResolvedValue([
        {
          id: 'account-1',
          name: 'Account 1',
          broker: 'Broker A',
          currency: 'USD',
          holdings: [{ id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 150 }],
          cashBalances: [],
          owners: [],
        },
      ]);

      const pricesMap = new Map([['AAPL', { error: 'Price not found' }]]);
      mockGetStockPrices.mockResolvedValue(pricesMap);
      mockIsStockPriceError.mockReturnValue(true);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findMany.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch portfolio');

      consoleErrorSpy.mockRestore();
    });
  });
});
