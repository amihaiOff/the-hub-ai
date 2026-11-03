/**
 * Route tests for the Habit Tracker API:
 *   GET/POST   /api/habits
 *   PATCH/DELETE /api/habits/[id]
 *   POST       /api/habits/reorder
 *   GET        /api/habits/logs
 *   PUT        /api/habits/[id]/log
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    habit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    habitLog: { findMany: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { NextRequest } from 'next/server';
import type { Habit } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';
import { POST as REORDER } from '../reorder/route';
import { GET as LOGS } from '../logs/route';
import { PUT as SET_LOG } from '../[id]/log/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  habit: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  habitLog: { findMany: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
  $transaction: jest.Mock;
};

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};
const OWNER = { householdId: 'household-1', ownerId: 'user-1' };

// Created Wednesday 2026-11-04; Mondays + Thursdays at 08:00, weekly.
function habitRow(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    householdId: 'household-1',
    ownerId: 'user-1',
    title: 'Stretch',
    icon: null,
    color: null,
    notify: true,
    weekdays: [1, 4],
    timeMinutes: 8 * 60,
    intervalWeeks: 1,
    startDate: new Date('2026-11-04T00:00:00Z'),
    sortOrder: 0,
    archivedAt: null,
    lastNotifiedOn: null,
    createdAt: new Date('2026-11-04T10:00:00Z'),
    updatedAt: new Date('2026-11-04T10:00:00Z'),
    ...overrides,
  };
}

const validCreate = {
  title: 'Stretch',
  notify: true,
  weekdays: [4, 1, 1],
  timeMinutes: 480,
  intervalWeeks: 1,
};

function req(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const params = (id = 'habit-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  // Thursday 2026-11-05 08:30 Israel (UTC+2).
  jest.setSystemTime(new Date('2026-11-05T06:30:00Z'));
  mockGetCurrentContext.mockResolvedValue(mockContext);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GET /api/habits', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET(req('/api/habits'));
    expect(res.status).toBe(401);
    expect(mockPrisma.habit.findMany).not.toHaveBeenCalled();
  });

  it("lists the user's active habits in sort order", async () => {
    mockPrisma.habit.findMany.mockResolvedValue([habitRow()]);
    const res = await GET(req('/api/habits'));
    expect(res.status).toBe(200);
    expect(mockPrisma.habit.findMany).toHaveBeenCalledWith({
      where: { ...OWNER, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data[0]).toMatchObject({
      id: 'habit-1',
      startDate: '2026-11-04',
      archivedAt: null,
      weekdays: [1, 4],
    });
    // Internal columns are not leaked.
    expect(json.data[0]).not.toHaveProperty('ownerId');
    expect(json.data[0]).not.toHaveProperty('lastNotifiedOn');
  });

  it('lists the archive with ?archived=1, newest archived first', async () => {
    mockPrisma.habit.findMany.mockResolvedValue([
      habitRow({ archivedAt: new Date('2026-11-05T06:00:00Z') }),
    ]);
    const res = await GET(req('/api/habits?archived=1'));
    expect(mockPrisma.habit.findMany).toHaveBeenCalledWith({
      where: { ...OWNER, archivedAt: { not: null } },
      orderBy: [{ archivedAt: 'desc' }],
    });
    const json = await res.json();
    expect(json.data[0].archivedAt).toBe('2026-11-05T06:00:00.000Z');
  });
});

describe('POST /api/habits', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(req('/api/habits', 'POST', validCreate));
    expect(res.status).toBe(401);
    expect(mockPrisma.habit.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing title', { ...validCreate, title: '   ' }],
    ['no weekdays', { ...validCreate, weekdays: [] }],
    ['weekday out of range', { ...validCreate, weekdays: [7] }],
    ['time not in 15-minute steps', { ...validCreate, timeMinutes: 485 }],
    ['time past 23:45', { ...validCreate, timeMinutes: 1440 }],
    ['interval above 4', { ...validCreate, intervalWeeks: 5 }],
    ['interval below 1', { ...validCreate, intervalWeeks: 0 }],
    ['bad color', { ...validCreate, color: 'red' }],
    ['missing notify', { ...validCreate, notify: undefined }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await POST(req('/api/habits', 'POST', body));
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(mockPrisma.habit.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-JSON body', async () => {
    const res = await POST(req('/api/habits', 'POST', 'not json'));
    expect(res.status).toBe(400);
  });

  it('appends at max sortOrder + 1, dedupes/sorts weekdays, and starts today', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue({ sortOrder: 4 });
    mockPrisma.habit.create.mockImplementation(async ({ data }) => habitRow(data));

    const res = await POST(req('/api/habits', 'POST', validCreate));
    expect(res.status).toBe(201);
    expect(mockPrisma.habit.findFirst).toHaveBeenCalledWith({
      where: OWNER,
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const { data } = mockPrisma.habit.create.mock.calls[0][0];
    expect(data).toMatchObject({
      ...OWNER,
      title: 'Stretch',
      weekdays: [1, 4],
      sortOrder: 5,
      startDate: new Date('2026-11-05T00:00:00Z'),
    });
    const json = await res.json();
    expect(json.data).toMatchObject({ startDate: '2026-11-05', sortOrder: 5 });
  });

  it('uses sortOrder 0 for the first habit', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    mockPrisma.habit.create.mockImplementation(async ({ data }) => habitRow(data));
    await POST(req('/api/habits', 'POST', validCreate));
    expect(mockPrisma.habit.create.mock.calls[0][0].data.sortOrder).toBe(0);
  });

  it('uses the Israel day, not the UTC day, for startDate', async () => {
    // 2026-11-04 23:30Z is already 01:30 on the 5th in Israel.
    jest.setSystemTime(new Date('2026-11-04T23:30:00Z'));
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    mockPrisma.habit.create.mockImplementation(async ({ data }) => habitRow(data));
    await POST(req('/api/habits', 'POST', validCreate));
    expect(mockPrisma.habit.create.mock.calls[0][0].data.startDate).toEqual(
      new Date('2026-11-05T00:00:00Z')
    );
  });

  it('ignores client-supplied owner / sortOrder / startDate fields', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    mockPrisma.habit.create.mockImplementation(async ({ data }) => habitRow(data));
    await POST(
      req('/api/habits', 'POST', {
        ...validCreate,
        ownerId: 'attacker',
        householdId: 'other',
        sortOrder: 99,
        startDate: '2020-01-01',
      })
    );
    const { data } = mockPrisma.habit.create.mock.calls[0][0];
    expect(data).toMatchObject({ ...OWNER, sortOrder: 0 });
    expect(data.startDate).toEqual(new Date('2026-11-05T00:00:00Z'));
  });
});

describe('PATCH /api/habits/[id]', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PATCH(req('/api/habits/habit-1', 'PATCH', { title: 'x' }), params());
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty update', async () => {
    const res = await PATCH(req('/api/habits/habit-1', 'PATCH', {}), params());
    expect(res.status).toBe(400);
    expect(mockPrisma.habit.update).not.toHaveBeenCalled();
  });

  it("returns 404 for another owner's habit", async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    const res = await PATCH(req('/api/habits/habit-1', 'PATCH', { title: 'x' }), params());
    expect(res.status).toBe(404);
    expect(mockPrisma.habit.findFirst).toHaveBeenCalledWith({
      where: { id: 'habit-1', ...OWNER },
    });
    expect(mockPrisma.habit.update).not.toHaveBeenCalled();
  });

  it('updates fields without touching archivedAt', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    mockPrisma.habit.update.mockResolvedValue(habitRow({ title: 'Walk' }));
    const res = await PATCH(req('/api/habits/habit-1', 'PATCH', { title: 'Walk' }), params());
    expect(res.status).toBe(200);
    const { data } = mockPrisma.habit.update.mock.calls[0][0];
    expect(data).toEqual({ title: 'Walk' });
    expect((await res.json()).data.title).toBe('Walk');
  });

  it('archived: true sets archivedAt to now', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    mockPrisma.habit.update.mockResolvedValue(habitRow({ archivedAt: new Date() }));
    await PATCH(req('/api/habits/habit-1', 'PATCH', { archived: true }), params());
    expect(mockPrisma.habit.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { archivedAt: new Date('2026-11-05T06:30:00Z') },
    });
  });

  it('archived: false clears archivedAt (restore)', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(
      habitRow({ archivedAt: new Date('2026-11-01T00:00:00Z') })
    );
    mockPrisma.habit.update.mockResolvedValue(habitRow());
    await PATCH(req('/api/habits/habit-1', 'PATCH', { archived: false }), params());
    expect(mockPrisma.habit.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { archivedAt: null },
    });
  });
});

describe('DELETE /api/habits/[id]', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await DELETE(req('/api/habits/habit-1', 'DELETE'), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 for another owner's habit", async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    const res = await DELETE(req('/api/habits/habit-1', 'DELETE'), params());
    expect(res.status).toBe(404);
    expect(mockPrisma.habit.delete).not.toHaveBeenCalled();
  });

  it('refuses with 409 when the habit is not archived', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    const res = await DELETE(req('/api/habits/habit-1', 'DELETE'), params());
    expect(res.status).toBe(409);
    expect(mockPrisma.habit.delete).not.toHaveBeenCalled();
  });

  it('deletes an archived habit', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(
      habitRow({ archivedAt: new Date('2026-11-01T00:00:00Z') })
    );
    mockPrisma.habit.delete.mockResolvedValue({});
    const res = await DELETE(req('/api/habits/habit-1', 'DELETE'), params());
    expect(res.status).toBe(200);
    expect(mockPrisma.habit.delete).toHaveBeenCalledWith({ where: { id: 'habit-1' } });
  });
});

describe('POST /api/habits/reorder', () => {
  const tx = { habit: { update: jest.fn() } };
  beforeEach(() => {
    tx.habit.update.mockReset();
    mockPrisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  });

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await REORDER(req('/api/habits/reorder', 'POST', { ids: ['a'] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty list', async () => {
    const res = await REORDER(req('/api/habits/reorder', 'POST', { ids: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when an id isn't the owner's", async () => {
    mockPrisma.habit.count.mockResolvedValue(1);
    const res = await REORDER(req('/api/habits/reorder', 'POST', { ids: ['a', 'b'] }));
    expect(res.status).toBe(404);
    expect(mockPrisma.habit.count).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, ...OWNER },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for duplicate ids', async () => {
    mockPrisma.habit.count.mockResolvedValue(1);
    const res = await REORDER(req('/api/habits/reorder', 'POST', { ids: ['a', 'a'] }));
    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes sortOrder = index for each id', async () => {
    mockPrisma.habit.count.mockResolvedValue(3);
    const res = await REORDER(req('/api/habits/reorder', 'POST', { ids: ['c', 'a', 'b'] }));
    expect(res.status).toBe(200);
    expect(tx.habit.update.mock.calls).toEqual([
      [{ where: { id: 'c' }, data: { sortOrder: 0 } }],
      [{ where: { id: 'a' }, data: { sortOrder: 1 } }],
      [{ where: { id: 'b' }, data: { sortOrder: 2 } }],
    ]);
  });
});

describe('GET /api/habits/logs', () => {
  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await LOGS(req('/api/habits/logs?from=2026-11-01&to=2026-11-30'));
    expect(res.status).toBe(401);
  });

  it.each([
    ['missing params', ''],
    ['bad format', '?from=2026-11-1&to=2026-11-30'],
    ['from after to', '?from=2026-11-30&to=2026-11-01'],
    ['range over 62 days', '?from=2026-01-01&to=2026-03-05'],
  ])('returns 400 for %s', async (_label, qs) => {
    const res = await LOGS(req(`/api/habits/logs${qs}`));
    expect(res.status).toBe(400);
    expect(mockPrisma.habitLog.findMany).not.toHaveBeenCalled();
  });

  it('accepts exactly 62 days and scopes to the owner', async () => {
    mockPrisma.habitLog.findMany.mockResolvedValue([
      { habitId: 'habit-1', date: new Date('2026-01-05T00:00:00Z'), status: 'DONE' },
    ]);
    const res = await LOGS(req('/api/habits/logs?from=2026-01-01&to=2026-03-04'));
    expect(res.status).toBe(200);
    expect(mockPrisma.habitLog.findMany).toHaveBeenCalledWith({
      where: {
        habit: OWNER,
        date: { gte: new Date('2026-01-01T00:00:00Z'), lte: new Date('2026-03-04T00:00:00Z') },
      },
      select: { habitId: true, date: true, status: true },
    });
    expect((await res.json()).data).toEqual([
      { habitId: 'habit-1', date: '2026-01-05', status: 'DONE' },
    ]);
  });
});

describe('PUT /api/habits/[id]/log', () => {
  const put = (body: unknown) => SET_LOG(req('/api/habits/habit-1/log', 'PUT', body), params());

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await put({ date: '2026-11-05', status: 'DONE' });
    expect(res.status).toBe(401);
  });

  it.each([
    ['bad date', { date: '05/11/2026', status: 'DONE' }],
    ['bad status', { date: '2026-11-05', status: 'MAYBE' }],
    ['missing status', { date: '2026-11-05' }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(mockPrisma.habit.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for another owner's habit", async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(null);
    const res = await put({ date: '2026-11-05', status: 'DONE' });
    expect(res.status).toBe(404);
    expect(mockPrisma.habit.findFirst).toHaveBeenCalledWith({
      // Owner only — the device may be in another of the owner's households.
      where: { id: 'habit-1', ownerId: OWNER.ownerId },
    });
  });

  it("rejects marking today before the habit's time (07:59 Israel)", async () => {
    jest.setSystemTime(new Date('2026-11-05T05:59:00Z'));
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    const res = await put({ date: '2026-11-05', status: 'DONE' });
    expect(res.status).toBe(400);
    expect(mockPrisma.habitLog.upsert).not.toHaveBeenCalled();
  });

  it('allows marking from exactly the habit time (08:00 Israel = 06:00Z)', async () => {
    jest.setSystemTime(new Date('2026-11-05T06:00:00Z'));
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    const res = await put({ date: '2026-11-05', status: 'DONE' });
    expect(res.status).toBe(200);
  });

  it.each([
    ['a non-scheduled weekday', '2026-11-04'],
    ['a day before the habit started', '2026-11-02'],
    ['a future scheduled day', '2026-11-09'],
  ])('rejects %s with 400', async (_label, date) => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    const res = await put({ date, status: 'DONE' });
    expect(res.status).toBe(400);
    expect(mockPrisma.habitLog.upsert).not.toHaveBeenCalled();
  });

  it('rejects a day on/after the habit was archived', async () => {
    jest.setSystemTime(new Date('2026-11-12T10:00:00Z'));
    mockPrisma.habit.findFirst.mockResolvedValue(
      habitRow({ archivedAt: new Date('2026-11-09T05:00:00Z') })
    );
    expect((await put({ date: '2026-11-09', status: 'DONE' })).status).toBe(400);
    // Days before the archive are still markable.
    expect((await put({ date: '2026-11-05', status: 'DONE' })).status).toBe(200);
  });

  it.each(['DONE', 'NOT_DONE'] as const)('upserts %s for a due day', async (status) => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    mockPrisma.habitLog.upsert.mockResolvedValue({});
    const res = await put({ date: '2026-11-05', status });
    expect(res.status).toBe(200);
    expect(mockPrisma.habitLog.upsert).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: 'habit-1', date: new Date('2026-11-05T00:00:00Z') } },
      create: { habitId: 'habit-1', date: new Date('2026-11-05T00:00:00Z'), status },
      update: { status },
    });
  });

  it('allows marking a past (missed) scheduled day', async () => {
    jest.setSystemTime(new Date('2026-11-10T10:00:00Z'));
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    const res = await put({ date: '2026-11-09', status: 'NOT_DONE' });
    expect(res.status).toBe(200);
    expect(mockPrisma.habitLog.upsert).toHaveBeenCalled();
  });

  it('status null deletes the log', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    mockPrisma.habitLog.delete.mockResolvedValue({});
    const res = await put({ date: '2026-11-05', status: null });
    expect(res.status).toBe(200);
    expect(mockPrisma.habitLog.delete).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: 'habit-1', date: new Date('2026-11-05T00:00:00Z') } },
    });
    expect(mockPrisma.habitLog.upsert).not.toHaveBeenCalled();
  });

  it('status null succeeds when there is no log to delete', async () => {
    mockPrisma.habit.findFirst.mockResolvedValue(habitRow());
    mockPrisma.habitLog.delete.mockRejectedValue(new Error('P2025'));
    const res = await put({ date: '2026-11-05', status: null });
    expect(res.status).toBe(200);
  });
});
