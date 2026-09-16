/**
 * Integration tests for /api/pages/[id]/share (GET, POST, DELETE).
 * Session-only — deliberately does NOT go through resolvePagesAccess, so the
 * scoped AGENT_PAGES_TOKEN can never read, manage, or rotate sharing (the raw
 * token comes back ONLY from this route's GET, never from the general
 * GET/PATCH /api/pages/[id], which IS reachable via that token).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/pages/share-token', () => ({
  generateShareToken: jest.fn(() => 'fresh-token'),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { generateShareToken } from '@/lib/pages/share-token';
import { GET, POST, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/pages/${id}/share`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params(id)
  );
}

describe('GET /api/pages/[id]/share', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s with no session', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(401);
  });

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(404);
  });

  it('returns the raw token and access for the owner', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      shareToken: 'tok-123',
      shareAccess: 'edit',
    });
    const res = await GET(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ shareToken: 'tok-123', shareAccess: 'edit' });
    expect(mockPrisma.page.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', householdId: 'hh-1' },
      select: { shareToken: true, shareAccess: true },
    });
  });
});

describe('POST /api/pages/[id]/share', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // resetAllMocks also wipes the factory-baked implementation below.
    (generateShareToken as jest.Mock).mockReturnValue('fresh-token');
  });

  it('401s with no session', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await post('p1', { access: 'view' });
    expect(res.status).toBe(401);
  });

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await post('p1', { access: 'view' });
    expect(res.status).toBe(404);
  });

  it('400s on an invalid access value', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareToken: null,
    });
    const res = await post('p1', { access: 'admin' });
    expect(res.status).toBe(400);
    expect(mockPrisma.page.update).not.toHaveBeenCalled();
  });

  it('generates a fresh token when the page was not previously shared', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareToken: null,
    });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({
      shareToken: 'fresh-token',
      shareAccess: 'view',
    });
    const res = await post('p1', { access: 'view' });
    expect(res.status).toBe(200);
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { shareToken: 'fresh-token', shareAccess: 'view' },
      select: { shareToken: true, shareAccess: true },
    });
  });

  it('keeps the existing token when just changing access, without regenerate', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareToken: 'existing-token',
    });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({
      shareToken: 'existing-token',
      shareAccess: 'edit',
    });
    const res = await post('p1', { access: 'edit' });
    expect(res.status).toBe(200);
    expect(generateShareToken).not.toHaveBeenCalled();
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { shareToken: 'existing-token', shareAccess: 'edit' },
      select: { shareToken: true, shareAccess: true },
    });
  });

  it('rotates the token when regenerate is true, invalidating the old link', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareToken: 'old-token',
    });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({
      shareToken: 'fresh-token',
      shareAccess: 'view',
    });
    const res = await post('p1', { access: 'view', regenerate: true });
    expect(res.status).toBe(200);
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { shareToken: 'fresh-token', shareAccess: 'view' },
      select: { shareToken: true, shareAccess: true },
    });
  });
});

describe('DELETE /api/pages/[id]/share', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s with no session', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(401);
  });

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(404);
    expect(mockPrisma.page.update).not.toHaveBeenCalled();
  });

  it('clears both share fields', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext as never);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({});
    const res = await DELETE(new NextRequest('http://localhost/api/pages/p1/share'), params('p1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { shareToken: null, shareAccess: null },
    });
  });
});
