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

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

function post(body: unknown) {
  return new NextRequest('http://localhost/api/pages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/pages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('lists pages scoped to the active household, ordered for the sidebar', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET();
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
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await POST(post({}));
    expect(res.status).toBe(401);
  });

  it('creates a page owned by the user in the active household, sorted to the top', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
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
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const huge = { type: 'doc', blob: 'x'.repeat(1_000_001) };
    const res = await POST(post({ content: huge }));
    expect(res.status).toBe(400);
    expect(mockPrisma.page.create).not.toHaveBeenCalled();
  });
});
