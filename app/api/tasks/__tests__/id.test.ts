/**
 * Integration tests for /api/tasks/[id] — permission matrix over
 * GET (owner or shared reader), PATCH (owner or shared editor),
 * DELETE (owner only).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
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
import { GET, PATCH, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function ctx(userId: string) {
  return {
    user: { id: userId, email: `${userId}@x.com`, name: userId },
    profile: { id: `p-${userId}`, name: userId, image: null, color: null, userId },
    households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
    activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
    householdProfiles: [],
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/tasks/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 404 when task not found in this household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('u1'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is neither owner nor sharee', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('stranger'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(403);
  });

  it('returns the task for a shared reader', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('reader'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [{ userId: 'reader', canEdit: false }],
    });
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('rejects a shared read-only user', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('reader'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [{ userId: 'reader', canEdit: false }],
    });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Nope' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(403);
  });

  it('allows the owner to patch title', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1', title: 'New' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'New' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
    const call = (mockPrisma.task.update as jest.Mock).mock.calls[0][0];
    expect(call.data.title).toBe('New');
  });

  it('allows a shared editor to change status', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('editor'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [{ userId: 'editor', canEdit: true }],
    });
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1', status: 'DONE' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/tasks/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('403s a shared editor (only owner may delete)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('editor'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [{ userId: 'editor', canEdit: true }],
    });
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(403);
  });

  it('deletes when the caller is the owner', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.delete as jest.Mock).mockResolvedValueOnce({});
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
