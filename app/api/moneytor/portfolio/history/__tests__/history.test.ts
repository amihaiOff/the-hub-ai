/**
 * Integration tests for GET /api/moneytor/portfolio/history.
 *
 * Builds a per-day total value timeseries from moneytor_stock_snapshots,
 * aggregating holdings + cash per (date, productId) and summing across accounts.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorStockSnapshot: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  moneytorStockSnapshot: { findMany: jest.Mock };
};

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
} as never;

function req(qs = '') {
  return new NextRequest(`http://localhost/api/moneytor/portfolio/history${qs}`);
}

beforeEach(() => jest.resetAllMocks());

describe('GET /api/moneytor/portfolio/history', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockPrisma.moneytorStockSnapshot.findMany).not.toHaveBeenCalled();
  });

  it('scopes to household + applies the default 1Y lower bound', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockResolvedValueOnce([]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, range: '1Y', points: [], accounts: [] });
    const call = mockPrisma.moneytorStockSnapshot.findMany.mock.calls[0][0];
    expect(call.where.householdId).toBe('hh-1');
    expect(call.where.snapshotDate.gte).toBeInstanceOf(Date);
    expect(call.orderBy).toEqual({ snapshotDate: 'asc' });
  });

  it('range=ALL drops the snapshotDate lower bound', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockResolvedValueOnce([]);

    const res = await GET(req('?range=ALL'));
    const body = await res.json();
    expect(body.range).toBe('ALL');
    const call = mockPrisma.moneytorStockSnapshot.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ householdId: 'hh-1' });
    expect(call.where.snapshotDate).toBeUndefined();
  });

  it('unknown range falls back to 1Y bound but echoes raw range', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockResolvedValueOnce([]);

    const res = await GET(req('?range=NOPE'));
    const body = await res.json();
    expect(body.range).toBe('NOPE');
    const call = mockPrisma.moneytorStockSnapshot.findMany.mock.calls[0][0];
    expect(call.where.snapshotDate.gte).toBeInstanceOf(Date);
  });

  it('aggregates holdings+cash per account/day and sums totals across accounts', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockResolvedValueOnce([
      // Product A, day 1: two holding rows, cash duplicated (50) → holdings 300, cash 50 = 350
      {
        snapshotDate: new Date('2026-01-01T00:00:00Z'),
        productId: 'A',
        totalWorthInBase: 100,
        accountCash: 50,
      },
      {
        snapshotDate: new Date('2026-01-01T12:00:00Z'),
        productId: 'A',
        totalWorthInBase: 200,
        accountCash: 50,
      },
      // Product A, day 2: 400 holdings + 60 cash = 460
      {
        snapshotDate: new Date('2026-01-02T00:00:00Z'),
        productId: 'A',
        totalWorthInBase: 400,
        accountCash: 60,
      },
      // Product B, day 1: 1000 holdings, null cash → cash stays 0 = 1000
      {
        snapshotDate: new Date('2026-01-01T00:00:00Z'),
        productId: 'B',
        totalWorthInBase: 1000,
        accountCash: null,
      },
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);

    const accA = body.accounts.find((a: { productId: string }) => a.productId === 'A');
    const accB = body.accounts.find((a: { productId: string }) => a.productId === 'B');
    expect(accA.points).toEqual([
      { date: '2026-01-01', value: 350 },
      { date: '2026-01-02', value: 460 },
    ]);
    expect(accB.points).toEqual([{ date: '2026-01-01', value: 1000 }]);

    // Totals: day1 = 350 + 1000 = 1350; day2 = 460 (+ B contributes 0)
    expect(body.points).toEqual([
      { date: '2026-01-01', value: 1350 },
      { date: '2026-01-02', value: 460 },
    ]);
  });

  it('returns empty payload when there are no snapshots', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockResolvedValueOnce([]);
    const res = await GET(req('?range=3M'));
    const body = await res.json();
    expect(body.points).toEqual([]);
    expect(body.accounts).toEqual([]);
  });

  it('returns 500 when the database query throws', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    mockPrisma.moneytorStockSnapshot.findMany.mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
    errSpy.mockRestore();
  });
});
