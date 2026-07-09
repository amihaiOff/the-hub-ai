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

  it('applies assignee/tag/search filters', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(
      new NextRequest(
        'http://localhost/api/tasks?assigneeId=clv0abcde12345678901234&tagId=clv0tagxx12345678901234&search=buy'
      )
    );
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.assigneeId).toBe('clv0abcde12345678901234');
    expect(call.where.tags).toEqual({ some: { id: 'clv0tagxx12345678901234' } });
    expect(call.where.title).toEqual({ contains: 'buy', mode: 'insensitive' });
  });

  it('treats parentTaskId=null (literal) as top-level only', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(new NextRequest('http://localhost/api/tasks?parentTaskId=null'));
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.parentTaskId).toBeNull();
  });

  it('scopes to a specific parent when parentTaskId is a real id', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(new NextRequest('http://localhost/api/tasks?parentTaskId=clv0parent1234567890123'));
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.parentTaskId).toBe('clv0parent1234567890123');
  });

  it('returns 400 on invalid filter enum', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    // Priority is still an enum; an unknown value fails validation.
    const res = await GET(new NextRequest('http://localhost/api/tasks?priority=PARKED'));
    expect(res.status).toBe(400);
  });
});

const CUID = 'clv0abcde12345678901234';

describe('POST /api/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'x' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('creates a task with all optional fields set', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    // Parent lookup for assertParentAllowed: valid top-level task in household.
    (mockPrisma.task.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CUID,
      parentTaskId: null,
      householdId: 'hh-1',
    });
    (mockPrisma.task.create as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Full',
          notes: 'note',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          dueDate: '2026-02-01T00:00:00.000Z',
          categoryId: CUID,
          assigneeId: CUID,
          parentTaskId: CUID,
          tagIds: [CUID],
          customFields: [{ id: 'f1', name: 'Field', type: 'number', value: 3 }],
        }),
      })
    );
    expect(res.status).toBe(201);
    const { data } = (mockPrisma.task.create as jest.Mock).mock.calls[0][0];
    expect(data.notes).toBe('note');
    expect(data.status).toBe('IN_PROGRESS');
    expect(data.priority).toBe('HIGH');
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(data.categoryId).toBe(CUID);
    expect(data.assigneeId).toBe(CUID);
    expect(data.parentTaskId).toBe(CUID);
    expect(data.tags).toEqual({ connect: [{ id: CUID }] });
    expect(data.customFields).toEqual([{ id: 'f1', name: 'Field', type: 'number', value: 3 }]);
  });

  it('returns 500 when the create unexpectedly fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.task.create as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Boom' }),
      })
    );
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

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
