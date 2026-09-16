/**
 * Integration tests for /api/share/[token] (GET) — the public, no-session
 * read. Must never leak householdId/ownerId/sectionId, and must return an
 * identical 404 whether the token is wrong, disabled, or never existed.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { GET } from '../route';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const params = (token: string) => ({ params: Promise.resolve({ token }) });

describe('GET /api/share/[token]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('404s on an unknown token', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/share/nope'), params('nope'));
    expect(res.status).toBe(404);
  });

  it('selects only public-safe fields — never household/owner identifiers', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      title: 'Grocery list',
      emoji: '🛒',
      autoCapitalize: true,
      shareAccess: 'view',
      tabs: [],
    });
    await GET(new NextRequest('http://localhost/api/share/tok'), params('tok'));

    expect(mockPrisma.page.findUnique).toHaveBeenCalledWith({
      where: { shareToken: 'tok' },
      select: expect.objectContaining({
        id: true,
        title: true,
        emoji: true,
        autoCapitalize: true,
        shareAccess: true,
      }),
    });
    const selectArg = (mockPrisma.page.findUnique as jest.Mock).mock.calls[0][0].select;
    expect(selectArg.householdId).toBeUndefined();
    expect(selectArg.ownerId).toBeUndefined();
    expect(selectArg.sectionId).toBeUndefined();
  });

  it('returns the page on a valid token', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      title: 'Grocery list',
      emoji: null,
      autoCapitalize: true,
      shareAccess: 'edit',
      tabs: [{ id: 't1', title: 'Main', content: null, sortOrder: 0 }],
    });
    const res = await GET(new NextRequest('http://localhost/api/share/tok'), params('tok'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.title).toBe('Grocery list');
    expect(json.data.shareAccess).toBe('edit');
  });
});
