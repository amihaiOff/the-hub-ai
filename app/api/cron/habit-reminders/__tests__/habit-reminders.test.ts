/**
 * Route tests for GET /api/cron/habit-reminders — pushes each habit's
 * reminder at its Israel-local time, claimed once per habit per day.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    habit: { findMany: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));

jest.mock('@/lib/notifications/push', () => ({
  sendPushToHousehold: jest.fn(),
}));

// serialize.ts (used by the route) imports auth-utils → stack/server.
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/utils/cron-logger', () => ({
  withCronLog: jest.fn(),
}));

import { NextRequest, NextResponse } from 'next/server';
import type { Habit } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sendPushToHousehold } from '@/lib/notifications/push';
import { withCronLog } from '@/lib/utils/cron-logger';
import { GET } from '../route';

const mockPrisma = prisma as unknown as {
  habit: { findMany: jest.Mock };
  $executeRaw: jest.Mock;
};
const mockSend = sendPushToHousehold as jest.MockedFunction<typeof sendPushToHousehold>;
const mockWithCronLog = withCronLog as jest.MockedFunction<typeof withCronLog>;

const originalNodeEnv = process.env.NODE_ENV;
const originalSecret = process.env.CRON_SECRET;
const setNodeEnv = (value: string | undefined) =>
  Object.defineProperty(process.env, 'NODE_ENV', { value, writable: true });

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/habit-reminders', { headers });
}

// Thursday 2026-11-05 08:30 Israel (UTC+2).
const NOW = new Date('2026-11-05T06:30:00Z');
const TODAY = new Date('2026-11-05T00:00:00Z');

// Weekly Mon + Thu at 08:00, created the day before.
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

describe('GET /api/cron/habit-reminders', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    // Pass-through: run the work and return its body.
    mockWithCronLog.mockImplementation(async (_path, work) => {
      const { body, status } = await work();
      return NextResponse.json(body, { status: status ?? 200 });
    });
    mockPrisma.habit.findMany.mockResolvedValue([]);
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockSend.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.useRealTimers();
    setNodeEnv(originalNodeEnv);
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  describe('auth', () => {
    it('returns 401 in production without a bearer', async () => {
      setNodeEnv('production');
      process.env.CRON_SECRET = 'secret';
      const res = await GET(request());
      expect(res.status).toBe(401);
      expect(mockPrisma.habit.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 in production with the wrong bearer', async () => {
      setNodeEnv('production');
      process.env.CRON_SECRET = 'secret';
      const res = await GET(request({ authorization: 'Bearer wrong' }));
      expect(res.status).toBe(401);
    });

    it('returns 401 in production when CRON_SECRET is unset', async () => {
      setNodeEnv('production');
      delete process.env.CRON_SECRET;
      const res = await GET(request({ authorization: 'Bearer undefined' }));
      expect(res.status).toBe(401);
    });

    it('accepts the right bearer in production', async () => {
      setNodeEnv('production');
      process.env.CRON_SECRET = 'secret';
      const res = await GET(request({ authorization: 'Bearer secret' }));
      expect(res.status).toBe(200);
    });

    it('needs no bearer outside production', async () => {
      setNodeEnv('test');
      const res = await GET(request());
      expect(res.status).toBe(200);
    });
  });

  it('queries due, unanswered, unnotified habits for the Israel day and minute', async () => {
    await GET(request());
    expect(mockPrisma.habit.findMany).toHaveBeenCalledWith({
      where: {
        notify: true,
        archivedAt: null,
        weekdays: { has: 4 },
        timeMinutes: { lte: 510, gte: 390 },
        OR: [{ lastNotifiedOn: null }, { lastNotifiedOn: { not: TODAY } }],
        logs: { none: { date: TODAY } },
      },
    });
  });

  it('returns early without withCronLog when there are no candidates', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 0 });
    expect(mockWithCronLog).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('drops rows that are not an occurrence today (off-week of an every-2-weeks habit)', async () => {
    // Started the Thursday a week ago with a 2-week interval → today is week 1.
    mockPrisma.habit.findMany.mockResolvedValue([
      habitRow({ intervalWeeks: 2, startDate: new Date('2026-10-29T00:00:00Z') }),
    ]);
    const res = await GET(request());
    expect(await res.json()).toEqual({ success: true, sent: 0 });
    expect(mockWithCronLog).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('claims via $executeRaw and sends the reminder to the owner only', async () => {
    mockPrisma.habit.findMany.mockResolvedValue([habitRow()]);
    const res = await GET(request());
    expect(mockWithCronLog).toHaveBeenCalledWith('/api/cron/habit-reminders', expect.any(Function));

    // Tagged-template call: (strings, today, id, today).
    const [, ...values] = mockPrisma.$executeRaw.mock.calls[0];
    expect(values).toEqual(['2026-11-05', 'habit-1', '2026-11-05']);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      'household-1',
      {
        title: 'Stretch',
        body: 'Scheduled for 08:00 — done?',
        url: '/habits',
        tag: 'habit-habit-1',
        actions: [
          { action: 'done', title: 'Done' },
          { action: 'not_done', title: 'Not done' },
        ],
        data: { habitId: 'habit-1', date: '2026-11-05' },
      },
      { userId: 'user-1' }
    );
    expect(await res.json()).toEqual({ success: true, sent: ['habit-1'], failed: [] });
  });

  it('does not send when the claim affects 0 rows (already claimed by another run)', async () => {
    mockPrisma.habit.findMany.mockResolvedValue([habitRow()]);
    mockPrisma.$executeRaw.mockResolvedValue(0);
    const res = await GET(request());
    expect(mockSend).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ success: true, sent: [], failed: [] });
  });

  it('one failure does not stop the others', async () => {
    mockPrisma.habit.findMany.mockResolvedValue([
      habitRow({ id: 'h1' }),
      habitRow({ id: 'h2', ownerId: 'user-2' }),
      habitRow({ id: 'h3' }),
    ]);
    mockSend.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('push down'));
    mockSend.mockResolvedValueOnce(1);
    const res = await GET(request());
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(await res.json()).toEqual({
      success: false,
      sent: ['h1', 'h3'],
      failed: [{ habitId: 'h2', error: 'push down' }],
    });
  });

  it('records a claim failure and continues', async () => {
    mockPrisma.habit.findMany.mockResolvedValue([habitRow({ id: 'h1' }), habitRow({ id: 'h2' })]);
    mockPrisma.$executeRaw.mockRejectedValueOnce('db gone').mockResolvedValueOnce(1);
    const res = await GET(request());
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      success: false,
      sent: ['h2'],
      failed: [{ habitId: 'h1', error: 'db gone' }],
    });
  });

  it('uses the Israel day across the UTC midnight boundary', async () => {
    // Thursday 2026-11-05 00:30 Israel is still Wednesday in UTC.
    jest.setSystemTime(new Date('2026-11-04T22:30:00Z'));
    mockPrisma.habit.findMany.mockResolvedValue([habitRow({ timeMinutes: 0 })]);
    await GET(request());
    const { where } = mockPrisma.habit.findMany.mock.calls[0][0];
    expect(where.weekdays).toEqual({ has: 4 });
    expect(where.timeMinutes).toEqual({ lte: 30, gte: -90 });
    expect(mockSend.mock.calls[0][1].data).toEqual({ habitId: 'habit-1', date: '2026-11-05' });
  });
});
