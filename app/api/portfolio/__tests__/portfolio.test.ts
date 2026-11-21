/**
 * Integration tests for /api/portfolio endpoint
 * Tests portfolio summary fetching
 */

// Mock the auth-utils module
const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
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
  convertSummaryToILS: jest.fn((summary) => summary),
}));

// Mock exchange-rates module
jest.mock('@/lib/api/exchange-rates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue({ USD: 3.6, EUR: 3.9, GBP: 4.5, ILS: 1 }),
}));

import type { CurrentContext } from '@/lib/auth-utils';
import { householdVisibleWhere } from '@/lib/utils/household-scope';

// getCurrentContext fixture. Portfolio routes are household-scoped: they read
// user.id, profile.id and activeHousehold.id from the context.
const HOUSEHOLD_ID = 'household-1';
function asContext(
  user: { id: string; email?: string | null; name?: string | null } | null
): CurrentContext | null {
  if (!user) return null;
  const household = { id: HOUSEHOLD_ID, name: 'Home', description: null, role: 'owner' as const };
  return {
    user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
    profile: {
      id: `profile-${user.id}`,
      name: user.name ?? 'Me',
      image: null,
      color: null,
      userId: user.id,
    },
    households: [household],
    activeHousehold: household,
    householdProfiles: [],
  };
}

import { GET } from '../route';

describe('Portfolio API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Re-apply default mock for exchange-rates after resetAllMocks
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetchExchangeRates } = require('@/lib/api/exchange-rates');
    (fetchExchangeRates as jest.Mock).mockResolvedValue({ USD: 3.6, EUR: 3.9, GBP: 4.5, ILS: 1 });
    // Re-apply default mock for convertSummaryToILS (identity function)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { convertSummaryToILS } = require('@/lib/utils/portfolio');
    (convertSummaryToILS as jest.Mock).mockImplementation((summary: unknown) => summary);
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  describe('GET /api/portfolio', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(null));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns empty data when no accounts exist', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findMany.mockResolvedValue([]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-123');
    });

    it('returns portfolio summary with accounts', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
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
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
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
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
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

    it('scopes accounts to the active household, not the signed-in user', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      // An account created by ANOTHER household member (userId differs) is
      // still returned: visibility is decided by the household filter.
      mockPrisma.stockAccount.findMany.mockResolvedValue([
        {
          id: 'account-partner',
          name: 'Partner Account',
          broker: null,
          currency: 'USD',
          userId: 'partner-user',
          holdings: [],
          cashBalances: [],
          owners: [],
        },
      ]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      const where = mockPrisma.stockAccount.findMany.mock.calls[0][0].where;
      expect(where).toEqual(householdVisibleWhere(HOUSEHOLD_ID));
      expect(where).not.toHaveProperty('userId');
      expect(data.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { calculatePortfolioSummary } = require('@/lib/utils/portfolio');
      const summarised = (calculatePortfolioSummary as jest.Mock).mock.calls[0][0];
      expect(summarised.map((a: { id: string }) => a.id)).toEqual(['account-partner']);
    });

    it('handles database error', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
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
