const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockTx = { favorite: { update: jest.fn() } };
const mockPrisma = {
  favorite: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const ctx = { user: { id: 'user-1' }, activeHousehold: { id: 'hh-1' } };

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/favorites/reorder', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => {
    await cb(mockTx);
  });
});

describe('POST /api/favorites/reorder', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(req({ favorites: [{ id: 'f1', sortOrder: 0 }] }));
    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('400 on invalid body', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await POST(req({ favorites: [] }));
    expect(res.status).toBe(400);
  });

  it('404 when a favourite id does not belong to the user', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.favorite.findMany.mockResolvedValue([{ id: 'f1' }]); // only one back
    const res = await POST(
      req({
        favorites: [
          { id: 'f1', sortOrder: 0 },
          { id: 'f2', sortOrder: 1 },
        ],
      })
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup by ownerId as well as household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.favorite.findMany.mockResolvedValue([{ id: 'f1' }]);
    await POST(req({ favorites: [{ id: 'f1', sortOrder: 0 }] }));
    expect(mockPrisma.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['f1'] }, ownerId: 'user-1', householdId: 'hh-1' },
      })
    );
  });

  it('updates each favourite in the submitted order inside one transaction', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.favorite.findMany.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);

    const res = await POST(
      req({
        favorites: [
          { id: 'f3', sortOrder: 0 },
          { id: 'f1', sortOrder: 1 },
          { id: 'f2', sortOrder: 2 },
        ],
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { updated: 3 } });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.favorite.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'f3' }, data: { sortOrder: 0 } },
      { where: { id: 'f1' }, data: { sortOrder: 1 } },
      { where: { id: 'f2' }, data: { sortOrder: 2 } },
    ]);
  });

  it('500 when the transaction throws', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.favorite.findMany.mockResolvedValue([{ id: 'f1' }]);
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req({ favorites: [{ id: 'f1', sortOrder: 0 }] }));
    expect(res.status).toBe(500);
  });
});
