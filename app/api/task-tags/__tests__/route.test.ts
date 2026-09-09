/**
 * Integration tests for /api/task-tags (list + create) and /api/task-tags/[id]
 * (token-rejection on the mutations).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    taskTag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/auth-tasks', () => ({
  resolveTasksAccess: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { resolveTasksAccess } from '@/lib/auth-tasks';
import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockResolveTasksAccess = resolveTasksAccess as jest.MockedFunction<typeof resolveTasksAccess>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

// The list GET is token-reachable, so it resolves access rather than a session.
const access = { householdId: 'hh-1', userId: 'user-1' };
const getRequest = () => new NextRequest('http://localhost/api/task-tags');

const postRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/task-tags', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('GET /api/task-tags', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockResolveTasksAccess.mockResolvedValue(null);
    const res = await GET(getRequest());
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns household-scoped tags ordered by name', async () => {
    mockResolveTasksAccess.mockResolvedValue(access);
    const tags = [{ id: 'tag-1', name: 'Urgent', color: '#f00', householdId: 'hh-1' }];
    (mockPrisma.taskTag.findMany as jest.Mock).mockResolvedValue(tags);

    const res = await GET(getRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(tags);
    expect(mockPrisma.taskTag.findMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('POST /api/task-tags', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(postRequest({ name: 'Work' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing/empty', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const res = await POST(postRequest({ name: '' }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('creates a tag with a color and household scope', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const created = { id: 'tag-1', name: 'Work', color: '#00f', householdId: 'hh-1' };
    (mockPrisma.taskTag.create as jest.Mock).mockResolvedValue(created);

    const res = await POST(postRequest({ name: 'Work', color: '#00f' }));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(created);
    expect(mockPrisma.taskTag.create).toHaveBeenCalledWith({
      data: { name: 'Work', color: '#00f', householdId: 'hh-1' },
    });
  });

  it('defaults color to null when omitted', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.taskTag.create as jest.Mock).mockResolvedValue({
      id: 'tag-2',
      name: 'Home',
      color: null,
      householdId: 'hh-1',
    });

    await POST(postRequest({ name: 'Home' }));

    const call = (mockPrisma.taskTag.create as jest.Mock).mock.calls[0][0];
    expect(call.data.color).toBeNull();
  });

  it('returns 409 on unique constraint (P2002)', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.taskTag.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

    const res = await POST(postRequest({ name: 'Dup' }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe('A tag with that name already exists');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.taskTag.create as jest.Mock).mockRejectedValue(new Error('boom'));

    const res = await POST(postRequest({ name: 'X' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to create');
  });
});

/**
 * Only the list GET is token-reachable. Tag mutations stay session-only, so
 * each is pinned by making `resolveTasksAccess` succeed (as it would for a
 * valid AGENT_TASKS_TOKEN) while there is no session: the handler must still
 * 401 and write nothing.
 */
describe('tag mutations stay session-only (token cannot mutate)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockResolveTasksAccess.mockResolvedValue(access);
    mockGetCurrentContext.mockResolvedValue(null);
  });

  const idParams = { params: Promise.resolve({ id: 'tag-1' }) };

  it('POST 401s for a token-only caller', async () => {
    const res = await POST(postRequest({ name: 'Agent invented this' }));
    expect(res.status).toBe(401);
    expect(mockPrisma.taskTag.create).not.toHaveBeenCalled();
  });

  it('PATCH 401s for a token-only caller', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/task-tags/tag-1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      idParams
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.taskTag.update).not.toHaveBeenCalled();
  });

  it('DELETE 401s for a token-only caller', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/task-tags/tag-1'), idParams);
    expect(res.status).toBe(401);
    expect(mockPrisma.taskTag.delete).not.toHaveBeenCalled();
  });
});
