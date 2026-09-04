/**
 * Integration tests for DELETE /api/favorites/[id].
 *
 * The ownership assertion is the point of this file: favourites are per-user,
 * so the guard scopes by `ownerId` as well as `householdId` — deviating from
 * the repo's usual household-only check. Without `ownerId` a housemate could
 * delete the other's favourites, so that where-clause is locked in here.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    favorite: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  favorite: { findFirst: jest.Mock; delete: jest.Mock };
};

const ctx = { user: { id: 'user-1' }, activeHousehold: { id: 'hh-1' } };
function authed() {
  mockGetCurrentContext.mockResolvedValue(
    ctx as unknown as Awaited<ReturnType<typeof getCurrentContext>>
  );
}

function del(id = 'f1') {
  return DELETE(new Request(`http://localhost/api/favorites/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('DELETE /api/favorites/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await del();
    expect(res.status).toBe(401);
    expect(mockPrisma.favorite.delete).not.toHaveBeenCalled();
  });

  it('removes the favourite and returns a bare success envelope', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValue({ id: 'f1' });
    mockPrisma.favorite.delete.mockResolvedValue({ id: 'f1' });

    const res = await del('f1');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(mockPrisma.favorite.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });

  it('returns 404 when the favourite is not found', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValue(null);
    const res = await del('missing');
    expect(res.status).toBe(404);
    expect(mockPrisma.favorite.delete).not.toHaveBeenCalled();
  });

  it('scopes the ownership guard by ownerId, not household alone', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValue({ id: 'f1' });
    mockPrisma.favorite.delete.mockResolvedValue({ id: 'f1' });

    await del('f1');

    expect(mockPrisma.favorite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f1', ownerId: 'user-1', householdId: 'hh-1' },
      })
    );
  });

  it('returns 500 when the delete throws', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValue({ id: 'f1' });
    mockPrisma.favorite.delete.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await del('f1');
    expect(res.status).toBe(500);
  });
});
