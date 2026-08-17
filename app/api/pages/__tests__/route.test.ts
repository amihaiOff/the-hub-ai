/**
 * Integration tests for /api/pages (list + create).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-pages', () => ({
  resolvePagesAccess: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { resolvePagesAccess } from '@/lib/auth-pages';
import { GET, POST } from '../route';

const mockResolveAccess = resolvePagesAccess as jest.MockedFunction<typeof resolvePagesAccess>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// resolvePagesAccess collapses both session and token auth to this shape, so the
// route can't tell them apart — token requests exercise the exact same paths.
const mockAccess = { householdId: 'hh-1', userId: 'user-1' };

function get() {
  return new NextRequest('http://localhost/api/pages');
}

function post(body: unknown) {
  return new NextRequest('http://localhost/api/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/pages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveAccess.mockResolvedValueOnce(null);
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it('lists pages scoped to the active household, ordered for the sidebar', async () => {
    mockResolveAccess.mockResolvedValueOnce(mockAccess);
    (mockPrisma.page.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(get());
    expect(mockPrisma.page.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId: 'hh-1' },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      })
    );
  });
});

describe('POST /api/pages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveAccess.mockResolvedValueOnce(null);
    const res = await POST(post({}));
    expect(res.status).toBe(401);
  });

  it('creates a page owned by the acting user in the household, sorted to the top', async () => {
    mockResolveAccess.mockResolvedValueOnce(mockAccess);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ sortOrder: -2 });
    (mockPrisma.page.create as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    const res = await POST(post({ title: 'Trip', emoji: '✈️' }));
    expect(res.status).toBe(201);
    expect(mockPrisma.page.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Trip',
          emoji: '✈️',
          sortOrder: -3,
          ownerId: 'user-1',
          householdId: 'hh-1',
        }),
      })
    );
  });

  it('rejects content that exceeds the size cap with 400', async () => {
    mockResolveAccess.mockResolvedValueOnce(mockAccess);
    const huge = { type: 'doc', blob: 'x'.repeat(1_000_001) };
    const res = await POST(post({ content: huge }));
    expect(res.status).toBe(400);
    expect(mockPrisma.page.create).not.toHaveBeenCalled();
  });
});
