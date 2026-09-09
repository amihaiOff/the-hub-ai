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
    taskCategory: { count: jest.fn() },
    taskTag: { count: jest.fn() },
    profile: { count: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

// GET and PATCH are token-reachable (they resolve access); DELETE stays
// session-only, so both auth paths are mocked here.
jest.mock('@/lib/auth-tasks', () => ({
  resolveTasksAccess: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { resolveTasksAccess } from '@/lib/auth-tasks';
import { GET, PATCH, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockResolveTasksAccess = resolveTasksAccess as jest.MockedFunction<typeof resolveTasksAccess>;
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

/** What resolveTasksAccess hands back for a given acting user. */
const accessFor = (userId: string) => ({ householdId: 'hh-1', userId });

/** All referenced relations exist in this household. */
function allRelationsValid() {
  (mockPrisma.taskCategory.count as jest.Mock).mockResolvedValue(1);
  (mockPrisma.profile.count as jest.Mock).mockResolvedValue(1);
  (mockPrisma.taskTag.count as jest.Mock).mockResolvedValue(1);
}

const CUID = 'clv0abcde12345678901234';

describe('GET /api/tasks/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when task not found in this household', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(accessFor('u1'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is neither owner nor sharee', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(accessFor('stranger'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    const res = await GET(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(403);
  });

  it('returns the task for a shared reader', async () => {
    mockResolveTasksAccess.mockResolvedValueOnce(accessFor('reader'));
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

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'x' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid payload (empty title)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: '' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the task does not exist in this household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'New' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(404);
  });

  it('applies every optional scalar/relation field the client sends', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    allRelationsValid();
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'New',
          notes: 'a note',
          status: 'IN_PROGRESS',
          priority: 'URGENT',
          type: 'OUT_AND_ABOUT',
          dueDate: '2026-01-01T00:00:00.000Z',
          sortOrder: 5,
          categoryId: CUID,
          assigneeId: CUID,
          tagIds: [CUID],
          customFields: [{ id: 'f1', name: 'Field', type: 'text', value: 'v' }],
        }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
    const { data } = (mockPrisma.task.update as jest.Mock).mock.calls[0][0];
    expect(data.title).toBe('New');
    expect(data.notes).toBe('a note');
    expect(data.status).toBe('IN_PROGRESS');
    expect(data.priority).toBe('URGENT');
    expect(data.type).toBe('OUT_AND_ABOUT');
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(data.sortOrder).toBe(5);
    expect(data.category).toEqual({ connect: { id: CUID } });
    expect(data.assignee).toEqual({ connect: { id: CUID } });
    expect(data.tags).toEqual({ set: [{ id: CUID }] });
    expect(data.customFields).toEqual([{ id: 'f1', name: 'Field', type: 'text', value: 'v' }]);
  });

  it('disconnects nullable relations and clears dueDate when set to null', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ dueDate: null, categoryId: null, assigneeId: null, type: null }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
    const { data } = (mockPrisma.task.update as jest.Mock).mock.calls[0][0];
    expect(data.dueDate).toBeNull();
    // `type` is a scalar enum, so clearing it is a plain null (not a disconnect).
    expect(data.type).toBeNull();
    expect(data.category).toEqual({ disconnect: true });
    expect(data.assignee).toEqual({ disconnect: true });
  });

  it('validates and connects a non-null parent (assertParentAllowed + assertNotConvertingParentToChild)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    // assertParentAllowed: parent is a valid top-level task in the household.
    (mockPrisma.task.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CUID,
      parentTaskId: null,
      householdId: 'hh-1',
    });
    // assertNotConvertingParentToChild: this task has no children.
    (mockPrisma.task.count as jest.Mock).mockResolvedValueOnce(0);
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ parentTaskId: CUID }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
    const { data } = (mockPrisma.task.update as jest.Mock).mock.calls[0][0];
    expect(data.parent).toEqual({ connect: { id: CUID } });
  });

  it('disconnects the parent when parentTaskId is null (no validation calls)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.update as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ parentTaskId: null }),
      }),
      params('t1')
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.task.findUnique).not.toHaveBeenCalled();
    const { data } = (mockPrisma.task.update as jest.Mock).mock.calls[0][0];
    expect(data.parent).toEqual({ disconnect: true });
  });

  it('maps a TaskValidationError to 400 (task with sub-tasks cannot become a child)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CUID,
      parentTaskId: null,
      householdId: 'hh-1',
    });
    // This task already has children -> converting it to a child throws.
    (mockPrisma.task.count as jest.Mock).mockResolvedValueOnce(2);
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ parentTaskId: CUID }),
      }),
      params('t1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when the update unexpectedly fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.update as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'New' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

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

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the task does not exist in this household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(404);
  });

  it('returns 500 when the delete unexpectedly fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(ctx('owner'));
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      ownerId: 'owner',
      shares: [],
    });
    (mockPrisma.task.delete as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation();
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

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

/**
 * The scoped AGENT_TASKS_TOKEN must never reach a destructive route. DELETE
 * deliberately keeps calling `getCurrentContext` instead of
 * `resolveTasksAccess`, so the way to pin that down is to make the resolver
 * succeed (as it would for a valid token) while there is no session, and prove
 * the handler still refuses. Without this test, swapping DELETE over to the
 * resolver would silently hand deletes to the token.
 */
describe('PATCH /api/tasks/[id] stays session-only', () => {
  beforeEach(() => jest.resetAllMocks());

  // The scoped agent token's write surface is create-only. Editing must stay
  // shut even when the token resolves access successfully, because overwriting
  // a title or notes body is data loss that needs no delete verb.
  it('401s when a scoped token resolves access but there is no session', async () => {
    mockResolveTasksAccess.mockResolvedValue(accessFor('owner'));
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Overwritten' }),
      }),
      params('t1')
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.task.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/[id] stays session-only', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s when a scoped token resolves access but there is no session', async () => {
    mockResolveTasksAccess.mockResolvedValue(accessFor('owner'));
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await DELETE(new NextRequest('http://localhost/api/tasks/t1'), params('t1'));
    expect(res.status).toBe(401);
    // Never even looked the task up, let alone deleted it.
    expect(mockPrisma.task.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
  });
});

/**
 * `assertRelationsInHousehold` runs on update as well as create: a client (or
 * agent) holding a stale id must get a 400 telling it the id is wrong, not a
 * 500 from Prisma failing the `connect`.
 */
describe('PATCH /api/tasks/[id] relation guards', () => {
  beforeEach(() => jest.resetAllMocks());

  /** The task exists in hh-1 and the caller owns it, so we reach the guard. */
  function ownedTaskExists() {
    (mockPrisma.task.findFirst as jest.Mock).mockResolvedValue({
      id: 't1',
      ownerId: 'owner',
      shares: [],
      parentTaskId: null,
    });
  }

  function patch(body: Record<string, unknown>) {
    return PATCH(
      new NextRequest('http://localhost/api/tasks/t1', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      params('t1')
    );
  }

  it('400s on a category from another household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx('owner'));
    ownedTaskExists();
    (mockPrisma.taskCategory.count as jest.Mock).mockResolvedValue(0);
    const res = await patch({ categoryId: CUID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown category/);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('400s on an assignee outside the household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx('owner'));
    ownedTaskExists();
    (mockPrisma.profile.count as jest.Mock).mockResolvedValue(0);
    const res = await patch({ assigneeId: CUID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown assignee/);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('400s when one of the tagIds is unknown', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx('owner'));
    ownedTaskExists();
    // Two ids sent, only one found in this household.
    (mockPrisma.taskTag.count as jest.Mock).mockResolvedValue(1);
    const res = await patch({ tagIds: [CUID, 'clv0zzzzz12345678901234'] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown tag/);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it("scopes the relation lookups to the session's household, not the request", async () => {
    mockGetCurrentContext.mockResolvedValue(ctx('owner'));
    ownedTaskExists();
    allRelationsValid();
    (mockPrisma.task.update as jest.Mock).mockResolvedValue({ id: 't1' });
    const res = await patch({ categoryId: CUID });
    expect(res.status).toBe(200);
    expect(mockPrisma.taskCategory.count).toHaveBeenCalledWith({
      where: { id: CUID, householdId: 'hh-1' },
    });
  });
});
