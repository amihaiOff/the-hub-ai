/**
 * Integration tests for /api/tasks (list + create).
 */

import { NextRequest } from 'next/server';

// Mocks must be declared before importing the route.
jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
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

describe('GET /api/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/tasks'));
    expect(res.status).toBe(401);
  });

  it('scopes the query to the active household and current user', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(new NextRequest('http://localhost/api/tasks'));

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          householdId: 'hh-1',
          OR: [{ ownerId: 'user-1' }, { shares: { some: { userId: 'user-1' } } }],
          parentTaskId: null, // default: top-level only
        }),
      })
    );
  });

  it('applies status/priority/category filters', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(
      new NextRequest(
        'http://localhost/api/tasks?status=DONE&priority=HIGH&categoryId=clv0abcde12345678901234'
      )
    );
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toBe('DONE');
    expect(call.where.priority).toBe('HIGH');
    expect(call.where.categoryId).toBe('clv0abcde12345678901234');
  });

  it('returns 400 on invalid filter enum', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await GET(new NextRequest('http://localhost/api/tasks?status=PARKED'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('requires a title', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects when parent is a sub-task itself (would nest two deep)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'parent',
      parentTaskId: 'grand',
      householdId: 'hh-1',
    });
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Deep', parentTaskId: 'clv0abcde12345678901234' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('creates a task with owner=current user and household=active', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.create as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      title: 'Do it',
      ownerId: 'user-1',
      householdId: 'hh-1',
    });
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Do it' }),
      })
    );
    expect(res.status).toBe(201);
    const call = (mockPrisma.task.create as jest.Mock).mock.calls[0][0];
    expect(call.data.ownerId).toBe('user-1');
    expect(call.data.householdId).toBe('hh-1');
    expect(call.data.title).toBe('Do it');
  });
});
