/**
 * Integration tests for GET /api/portfolio/account-history.
 *
 * Builds a per-account daily ILS value timeseries from stock_price_history and
 * current holdings. convertPrice is kept real (via requireActual) so value
 * assertions exercise the actual conversion math; only the network-bound
 * fetchExchangeRates is mocked.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    stockAccount: { findMany: jest.fn() },
    stockPriceHistory: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/api/exchange-rates', () => {
  const actual = jest.requireActual('@/lib/api/exchange-rates');
  return { ...actual, fetchExchangeRates: jest.fn() };
});

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { fetchExchangeRates } from '@/lib/api/exchange-rates';
import { GET } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockFetchRates = fetchExchangeRates as jest.MockedFunction<typeof fetchExchangeRates>;
const mockPrisma = prisma as unknown as {
  stockAccount: { findMany: jest.Mock };
  stockPriceHistory: { findMany: jest.Mock };
};

const mockUser = { id: 'user-1', email: 't@x.com', name: 'Me' } as never;

// USD chosen != DEFAULT (3.7) so tests can prove which rate table was used.
const RATES = { USD: 4, EUR: 5, GBP: 6, ILS: 1 };

function req(qs = '') {
  return new NextRequest(`http://localhost/api/portfolio/account-history${qs}`);
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFetchRates.mockResolvedValue(RATES);
});

describe('GET /api/portfolio/account-history', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'Unauthorized' });
    expect(mockPrisma.stockAccount.findMany).not.toHaveBeenCalled();
  });

  it('scopes the account query to the current user and returns empty when no holdings', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      { id: 'acc-1', holdings: [], cashBalances: [] },
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.stockAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    // No symbols anywhere → short-circuits before touching price history.
    expect(mockPrisma.stockPriceHistory.findMany).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, range: '1Y', accounts: [] });
  });

  it('computes daily ILS value = quantity*price*rate + cash, using fetched rates', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [{ symbol: 'AAPL', quantity: 2 }],
        cashBalances: [{ amount: 100, currency: 'ILS' }],
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T10:00:00Z'), price: 150 },
      { symbol: 'AAPL', timestamp: new Date('2026-01-02T10:00:00Z'), price: 160 },
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.range).toBe('1Y');
    expect(body.accounts).toEqual([
      {
        accountId: 'acc-1',
        points: [
          { date: '2026-01-01', value: 2 * 150 * 4 + 100 }, // 1300
          { date: '2026-01-02', value: 2 * 160 * 4 + 100 }, // 1380
        ],
      },
    ]);
    // Default range uses a lower bound (days > 0 → gte set).
    const priceCall = mockPrisma.stockPriceHistory.findMany.mock.calls[0][0];
    expect(priceCall.where.symbol).toEqual({ in: ['AAPL'] });
    expect(priceCall.where.timestamp.gte).toBeInstanceOf(Date);
    expect(priceCall.where.timestamp.gte.getTime()).toBeGreaterThan(0);
  });

  it('falls back to DEFAULT_RATES (USD 3.7) when fetchExchangeRates returns null', async () => {
    mockFetchRates.mockReset();
    mockFetchRates.mockResolvedValueOnce(null);
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [{ symbol: 'AAPL', quantity: 1 }],
        cashBalances: [],
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T10:00:00Z'), price: 100 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.accounts[0].points[0].value).toBe(100 * 3.7);
  });

  it('range=ALL removes the lower time bound (since epoch 0)', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      { id: 'acc-1', holdings: [{ symbol: 'AAPL', quantity: 1 }], cashBalances: [] },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([]);

    const res = await GET(req('?range=ALL'));
    const body = await res.json();
    expect(body.range).toBe('ALL');
    const priceCall = mockPrisma.stockPriceHistory.findMany.mock.calls[0][0];
    expect(priceCall.where.timestamp.gte.getTime()).toBe(0);
  });

  it('unknown range falls back to 1Y semantics but echoes the raw range', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([]);
    const res = await GET(req('?range=BOGUS'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.range).toBe('BOGUS');
    expect(body.accounts).toEqual([]);
  });

  it('collapses multiple same-day prices to the last one and converts non-ILS cash', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [{ symbol: 'AAPL', quantity: 1 }],
        cashBalances: [{ amount: 10, currency: 'USD' }], // 10 * 4 = 40 ILS
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T09:00:00Z'), price: 100 },
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T16:00:00Z'), price: 120 }, // overrides same day
    ]);

    const res = await GET(req());
    const body = await res.json();
    // Single collapsed date, last price 120: 1*120*4 + (10*4) = 480 + 40 = 520
    expect(body.accounts[0].points).toEqual([{ date: '2026-01-01', value: 520 }]);
  });

  it('skips dates where any holding lacks a price on/before that date', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [
          { symbol: 'AAPL', quantity: 1 },
          { symbol: 'MSFT', quantity: 1 },
        ],
        cashBalances: [],
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      // date1: only AAPL has data → MSFT missing → date1 dropped
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T10:00:00Z'), price: 100 },
      // date2: both present → included
      { symbol: 'AAPL', timestamp: new Date('2026-01-02T10:00:00Z'), price: 110 },
      { symbol: 'MSFT', timestamp: new Date('2026-01-02T10:00:00Z'), price: 200 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.accounts[0].points).toEqual([
      { date: '2026-01-02', value: (110 + 200) * 4 }, // 1240
    ]);
  });

  it('infers native currency from symbol suffix (.TA=ILS, .L=GBP, .DE=EUR)', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [
          { symbol: 'TEVA.TA', quantity: 1 }, // ILS → rate 1
          { symbol: 'VOD.L', quantity: 1 }, // GBP → rate 6
          { symbol: 'SAP.DE', quantity: 1 }, // EUR → rate 5
        ],
        cashBalances: [],
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      { symbol: 'TEVA.TA', timestamp: new Date('2026-01-01T10:00:00Z'), price: 10 },
      { symbol: 'VOD.L', timestamp: new Date('2026-01-01T10:00:00Z'), price: 10 },
      { symbol: 'SAP.DE', timestamp: new Date('2026-01-01T10:00:00Z'), price: 10 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    // 10*1 (ILS) + 10*6 (GBP) + 10*5 (EUR) = 10 + 60 + 50 = 120
    expect(body.accounts[0].points).toEqual([{ date: '2026-01-01', value: 120 }]);
  });

  it('produces no points when a holding has no price rows at all', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockResolvedValueOnce([
      {
        id: 'acc-1',
        holdings: [
          { symbol: 'AAPL', quantity: 1 }, // has prices → contributes dates
          { symbol: 'GOOG', quantity: 1 }, // never appears in price history
        ],
        cashBalances: [],
      },
    ]);
    mockPrisma.stockPriceHistory.findMany.mockResolvedValueOnce([
      { symbol: 'AAPL', timestamp: new Date('2026-01-01T10:00:00Z'), price: 100 },
    ]);

    const res = await GET(req());
    const body = await res.json();
    // GOOG has no price on any date → every date fails allHaveData → no points.
    expect(body.accounts[0].points).toEqual([]);
  });

  it('returns 500 when the database query throws', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(mockUser);
    mockPrisma.stockAccount.findMany.mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
    errSpy.mockRestore();
  });
});
