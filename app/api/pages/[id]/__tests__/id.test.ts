/**
 * Integration tests for /api/pages/[id] (get, patch, delete).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, PATCH, DELETE } from '../route';

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

describe('GET /api/pages/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/pages/p1'), params('p1'));
    expect(res.status).toBe(404);
  });

  it('returns the page when found', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'p1', title: 'X' });
    const res = await GET(new NextRequest('http://localhost/api/pages/p1'), params('p1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe('p1');
  });
});

describe('PATCH /api/pages/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  function patch(id: string, body: unknown) {
    return PATCH(
      new NextRequest(`http://localhost/api/pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      params(id)
    );
  }

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await patch('p1', { title: 'New' });
    expect(res.status).toBe(404);
    expect(mockPrisma.page.update).not.toHaveBeenCalled();
  });

  it('only writes the keys the client sent', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({ id: 'p1', title: 'New' });
    const res = await patch('p1', { title: 'New' });
    expect(res.status).toBe(200);
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { title: 'New' },
    });
  });

  it('clears emoji when null is sent', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    (mockPrisma.page.update as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    await patch('p1', { emoji: null });
    expect(mockPrisma.page.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { emoji: null },
    });
  });
});

describe('DELETE /api/pages/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest('http://localhost/api/pages/p1'), params('p1'));
    expect(res.status).toBe(404);
    expect(mockPrisma.page.delete).not.toHaveBeenCalled();
  });

  it('deletes a page in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    (mockPrisma.page.delete as jest.Mock).mockResolvedValueOnce({ id: 'p1' });
    const res = await DELETE(new NextRequest('http://localhost/api/pages/p1'), params('p1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.page.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
