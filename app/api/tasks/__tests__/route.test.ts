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
    taskCategory: { count: jest.fn() },
    taskTag: { count: jest.fn() },
    profile: { count: jest.fn() },
  },
}));

// These routes resolve either a session or a scoped agent token, and can't tell
// the two apart — so the tests mock the resolver, not the session.
jest.mock('@/lib/auth-tasks', () => ({
  resolveTasksAccess: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { resolveTasksAccess } from '@/lib/auth-tasks';
import { GET, POST } from '../route';

const mockResolveTasksAccess = resolveTasksAccess as jest.MockedFunction<typeof resolveTasksAccess>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const access = { householdId: 'hh-1', userId: 'user-1' };

/** All referenced relations exist in this household. */
function allRelationsValid() {
  (mockPrisma.taskCategory.count as jest.Mock).mockResolvedValue(1);
  (mockPrisma.profile.count as jest.Mock).mockResolvedValue(1);
  (mockPrisma.taskTag.count as jest.Mock).mockResolvedValue(1);
}

describe('GET /api/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/tasks'));
    expect(res.status).toBe(401);
  });

  it('scopes the query to the active household and current user', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
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

  it('applies status/priority/type/category filters', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(
      new NextRequest(
        'http://localhost/api/tasks?status=DONE&priority=HIGH&type=DEEP_WORK&categoryId=clv0abcde12345678901234'
      )
    );
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toBe('DONE');
    expect(call.where.priority).toBe('HIGH');
    expect(call.where.type).toBe('DEEP_WORK');
    expect(call.where.categoryId).toBe('clv0abcde12345678901234');
  });

  it('rejects an unknown type filter with 400', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    const res = await GET(new NextRequest('http://localhost/api/tasks?type=ERRANDS'));
    expect(res.status).toBe(400);
  });

  it('applies assignee/tag/search filters', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
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
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(new NextRequest('http://localhost/api/tasks?parentTaskId=null'));
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.parentTaskId).toBeNull();
  });

  it('scopes to a specific parent when parentTaskId is a real id', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    (mockPrisma.task.findMany as jest.Mock).mockResolvedValueOnce([]);
    await GET(new NextRequest('http://localhost/api/tasks?parentTaskId=clv0parent1234567890123'));
    const call = (mockPrisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.parentTaskId).toBe('clv0parent1234567890123');
  });

  it('returns 400 on invalid filter enum', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    // Priority is still an enum; an unknown value fails validation.
    const res = await GET(new NextRequest('http://localhost/api/tasks?priority=PARKED'));
    expect(res.status).toBe(400);
  });
});

const CUID = 'clv0abcde12345678901234';

describe('POST /api/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(null);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'x' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('creates a task with all optional fields set', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    allRelationsValid();
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
          type: 'CALLS',
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
    expect(data.type).toBe('CALLS');
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(data.categoryId).toBe(CUID);
    expect(data.assigneeId).toBe(CUID);
    expect(data.parentTaskId).toBe(CUID);
    expect(data.tags).toEqual({ connect: [{ id: CUID }] });
    expect(data.customFields).toEqual([{ id: 'f1', name: 'Field', type: 'number', value: 3 }]);
  });

  it('rejects an unknown category with 400 rather than a 500', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    (mockPrisma.taskCategory.count as jest.Mock).mockResolvedValueOnce(0);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Mislabelled', categoryId: CUID }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown category/);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects an assignee from outside the household with 400', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    (mockPrisma.profile.count as jest.Mock).mockResolvedValueOnce(0);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Someone else', assigneeId: CUID }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('scopes relation lookups to the resolved household, not the request', async () => {
    // The token path resolves its own household; a caller can't smuggle one in.
    mockResolveTasksAccess.mockResolvedValueOnce({ householdId: 'hh-token', userId: 'owner-1' });
    allRelationsValid();
    (mockPrisma.task.create as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Filed by agent', categoryId: CUID }),
      })
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.taskCategory.count).toHaveBeenCalledWith({
      where: { id: CUID, householdId: 'hh-token' },
    });
    // And the task is attributed to the household owner the token resolved to.
    const call = (mockPrisma.task.create as jest.Mock).mock.calls[0][0];
    expect(call.data.ownerId).toBe('owner-1');
    expect(call.data.householdId).toBe('hh-token');
  });

  it('returns 500 when the create unexpectedly fails', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
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
    mockResolveTasksAccess.mockResolvedValueOnce(access);
    const res = await POST(
      new NextRequest('http://localhost/api/tasks', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects when parent is a sub-task itself (would nest two deep)', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(access);
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
    mockResolveTasksAccess.mockResolvedValueOnce(access);
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
