/**
 * Integration tests for /api/favorites (list + create).
 *
 * Unlike the pages family these routes authenticate with `getCurrentContext()`
 * — favourites are per-user, so agent-token auth (which collapses onto the
 * household owner) must never reach them. Both the pre-check 409 and the
 * P2002 race 409 are covered: the pre-check can lose a race, and the unique
 * indexes are the backstop.
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

jest.mock('@/lib/db', () => ({
  prisma: {
    favorite: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    page: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  favorite: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  page: { findFirst: jest.Mock };
};

const ctx = { user: { id: 'user-1' }, activeHousehold: { id: 'hh-1' } };
function authed() {
  mockGetCurrentContext.mockResolvedValue(
    ctx as unknown as Awaited<ReturnType<typeof getCurrentContext>>
  );
}

const NOW = new Date('2026-09-01T00:00:00.000Z');

/** Minimal Prisma favourite row (page relation included, as the route selects). */
function makeDbFavorite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    pageId: null,
    route: '/tasks',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    page: null,
    ...overrides,
  };
}

function post(body: unknown) {
  return new NextRequest('http://localhost/api/favorites', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/favorites', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockPrisma.favorite.findMany).not.toHaveBeenCalled();
  });

  it('derives kind for both page and route rows', async () => {
    authed();
    mockPrisma.favorite.findMany.mockResolvedValue([
      makeDbFavorite({
        id: 'f-page',
        pageId: 'p1',
        route: null,
        page: { id: 'p1', title: 'Roadmap', emoji: '🗺️' },
      }),
      makeDbFavorite({ id: 'f-route', pageId: null, route: '/budget', sortOrder: 1 }),
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([
      {
        id: 'f-page',
        kind: 'page',
        pageId: 'p1',
        route: null,
        pageTitle: 'Roadmap',
        pageEmoji: '🗺️',
        sortOrder: 0,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: 'f-route',
        kind: 'route',
        pageId: null,
        route: '/budget',
        pageTitle: null,
        pageEmoji: null,
        sortOrder: 1,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it('scopes to the owner + household and orders with the createdAt tiebreak', async () => {
    authed();
    mockPrisma.favorite.findMany.mockResolvedValue([]);
    await GET();
    expect(mockPrisma.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'user-1', householdId: 'hh-1' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
    );
  });

  it('returns 500 when the query throws', async () => {
    authed();
    mockPrisma.favorite.findMany.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('POST /api/favorites', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(post({ route: '/tasks' }));
    expect(res.status).toBe(401);
    expect(mockPrisma.favorite.create).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid body (neither target)', async () => {
    authed();
    const res = await POST(post({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe('Provide exactly one of pageId or route');
    expect(mockPrisma.favorite.create).not.toHaveBeenCalled();
  });

  it('creates a page favourite (201) scoped to the acting user', async () => {
    authed();
    mockPrisma.page.findFirst.mockResolvedValue({ id: 'p1' });
    mockPrisma.favorite.findFirst
      .mockResolvedValueOnce(null) // duplicate pre-check
      .mockResolvedValueOnce({ sortOrder: 2 }); // current max
    mockPrisma.favorite.create.mockResolvedValue(
      makeDbFavorite({
        id: 'f-new',
        pageId: 'p1',
        route: null,
        sortOrder: 3,
        page: { id: 'p1', title: 'Roadmap', emoji: null },
      })
    );

    const res = await POST(post({ pageId: 'p1' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ id: 'f-new', kind: 'page', pageId: 'p1', route: null });
    expect(mockPrisma.favorite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ownerId: 'user-1',
          householdId: 'hh-1',
          pageId: 'p1',
          route: null,
          sortOrder: 3,
        },
      })
    );
  });

  it('creates a route favourite (201)', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockPrisma.favorite.create.mockResolvedValue(
      makeDbFavorite({ id: 'f-new', route: '/budget/transactions' })
    );

    const res = await POST(post({ route: '/budget/transactions' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.kind).toBe('route');
    expect(mockPrisma.page.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.favorite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pageId: null, route: '/budget/transactions' }),
      })
    );
  });

  it('returns 404 when the page belongs to another household', async () => {
    authed();
    mockPrisma.page.findFirst.mockResolvedValue(null);
    const res = await POST(post({ pageId: 'p-other' }));
    expect(res.status).toBe(404);
    expect(mockPrisma.page.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-other', householdId: 'hh-1' } })
    );
    expect(mockPrisma.favorite.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a route that is not nav-registered', async () => {
    authed();
    const res = await POST(post({ route: '/wiki/abc123' }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("This page can't be added to favorites");
    expect(mockPrisma.favorite.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the duplicate pre-check finds an existing row', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce({ id: 'f-existing' });
    const res = await POST(post({ route: '/tasks' }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Already in favorites');
    expect(mockPrisma.favorite.create).not.toHaveBeenCalled();
  });

  it('looks the duplicate up by findFirst with the nullable target only', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce({ id: 'f-existing' });
    await POST(post({ route: '/tasks' }));
    expect(mockPrisma.favorite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'user-1', householdId: 'hh-1', route: '/tasks' },
      })
    );
  });

  it('returns 409 when create loses the race and Prisma throws P2002', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockPrisma.favorite.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );
    const res = await POST(post({ route: '/tasks' }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Already in favorites');
  });

  it('computes sortOrder as max + 1, starting at 0 for an empty list', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockPrisma.favorite.create.mockResolvedValue(makeDbFavorite());
    await POST(post({ route: '/tasks' }));
    expect(mockPrisma.favorite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) })
    );
  });

  it('ignores a client-sent sortOrder', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      sortOrder: 4,
    });
    mockPrisma.favorite.create.mockResolvedValue(makeDbFavorite());
    await POST(post({ route: '/tasks', sortOrder: 999 }));
    expect(mockPrisma.favorite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 5 }) })
    );
  });

  it('returns 500 on an unexpected failure', async () => {
    authed();
    mockPrisma.favorite.findFirst.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post({ route: '/tasks' }));
    expect(res.status).toBe(500);
  });
});
