/**
 * Route tests for GET /api/cron/weekly-eating-out — Saturday 20:00 Israel
 * eating-out push for every household with a registered device.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findMany: jest.fn() },
    cronRunLog: { create: jest.fn() },
  },
}));

// Keep the real scheduling helpers; stub only the per-household send.
jest.mock('@/lib/notifications/weekly-eating-out', () => ({
  ...jest.requireActual('@/lib/notifications/weekly-eating-out'),
  sendWeeklyEatingOut: jest.fn(),
}));

jest.mock('@/lib/api/moneytor-sync', () => ({
  syncMoneytorForHouseholdAndLog: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWeeklyEatingOut } from '@/lib/notifications/weekly-eating-out';
import { syncMoneytorForHouseholdAndLog } from '@/lib/api/moneytor-sync';
import { GET, maxDuration } from '../route';

const mockPrisma = prisma as unknown as {
  household: { findMany: jest.Mock };
  cronRunLog: { create: jest.Mock };
};
const mockSendWeekly = sendWeeklyEatingOut as jest.MockedFunction<typeof sendWeeklyEatingOut>;
const mockSync = syncMoneytorForHouseholdAndLog as jest.MockedFunction<
  typeof syncMoneytorForHouseholdAndLog
>;

const originalNodeEnv = process.env.NODE_ENV;
const originalSecret = process.env.CRON_SECRET;
const originalToken = process.env.MONEYTOR_API_TOKEN;
const setNodeEnv = (value: string | undefined) =>
  Object.defineProperty(process.env, 'NODE_ENV', { value, writable: true });

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/weekly-eating-out', { headers });
}

// Saturday 2026-10-24 20:30 Israel (UTC+3).
const SEND_TIME = new Date('2026-10-24T17:30:00Z');
// Same Saturday, 21:30 Israel — the other scheduled UTC run.
const OFF_TIME = new Date('2026-10-24T18:30:00Z');

describe('GET /api/cron/weekly-eating-out', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.MONEYTOR_API_TOKEN;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.resetAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(SEND_TIME);
    mockPrisma.cronRunLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalToken === undefined) delete process.env.MONEYTOR_API_TOKEN;
    else process.env.MONEYTOR_API_TOKEN = originalToken;
    jest.useRealTimers();
    setNodeEnv(originalNodeEnv);
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('returns 401 in production with the wrong CRON_SECRET bearer', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';

    const res = await GET(request({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.cronRunLog.create).not.toHaveBeenCalled();
  });

  it('returns 401 in production when CRON_SECRET is unset', async () => {
    setNodeEnv('production');
    delete process.env.CRON_SECRET;

    // A literal "Bearer undefined" must not get through.
    const res = await GET(request({ authorization: 'Bearer undefined' }));
    expect(res.status).toBe(401);
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
  });

  it('runs in production with the right CRON_SECRET bearer', async () => {
    setNodeEnv('production');
    process.env.CRON_SECRET = 'secret';
    mockPrisma.household.findMany.mockResolvedValue([]);

    const res = await GET(request({ authorization: 'Bearer secret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: [], failed: [] });
  });

  it('skips without querying households outside Saturday 20:00 Israel time', async () => {
    jest.setSystemTime(OFF_TIME);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skipped).toEqual(expect.any(String));
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
    expect(mockSendWeekly).not.toHaveBeenCalled();
    // Still logged as a cron run.
    expect(mockPrisma.cronRunLog.create).toHaveBeenCalledTimes(1);
  });

  it('sends to households with push subscriptions at send time', async () => {
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }, { id: 'hh-2' }]);
    mockSendWeekly.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: ['hh-1'], failed: [] });

    expect(mockPrisma.household.findMany).toHaveBeenCalledWith({
      where: { pushSubscriptions: { some: {} } },
      select: { id: true },
    });
    expect(mockSendWeekly).toHaveBeenCalledTimes(2);
    expect(mockSendWeekly).toHaveBeenCalledWith('hh-1', SEND_TIME);
    expect(mockSendWeekly).toHaveBeenCalledWith('hh-2', SEND_TIME);
  });

  it('also sends at 20:xx Israel in winter time (18:xx UTC)', async () => {
    jest.setSystemTime(new Date('2026-11-28T18:05:00Z'));
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockSendWeekly.mockResolvedValue(true);

    const res = await GET(request());
    expect(await res.json()).toEqual({ success: true, sent: ['hh-1'], failed: [] });
  });

  it('allows 120s for the pre-summary bank sync', () => {
    expect(maxDuration).toBe(120);
  });

  it('syncs Moneytor for each household before sending when the token is set', async () => {
    process.env.MONEYTOR_API_TOKEN = 'token';
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }, { id: 'hh-2' }]);
    mockSync.mockResolvedValue({} as Awaited<ReturnType<typeof syncMoneytorForHouseholdAndLog>>);
    mockSendWeekly.mockResolvedValue(true);

    const res = await GET(request());
    expect(await res.json()).toEqual({ success: true, sent: ['hh-1', 'hh-2'], failed: [] });

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenNthCalledWith(1, 'hh-1', 'cron');
    expect(mockSync).toHaveBeenNthCalledWith(2, 'hh-2', 'cron');
    // Each household's sync lands before its own summary is sent.
    expect(mockSync.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendWeekly.mock.invocationCallOrder[0]
    );
    expect(mockSync.mock.invocationCallOrder[1]).toBeLessThan(
      mockSendWeekly.mock.invocationCallOrder[1]
    );
  });

  it('does not sync Moneytor when the token is unset', async () => {
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockSendWeekly.mockResolvedValue(true);

    const res = await GET(request());
    expect(await res.json()).toEqual({ success: true, sent: ['hh-1'], failed: [] });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('still sends the summary when the pre-summary sync fails', async () => {
    process.env.MONEYTOR_API_TOKEN = 'token';
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }]);
    mockSync.mockRejectedValue(new Error('Moneytor down'));
    mockSendWeekly.mockResolvedValue(true);

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: ['hh-1'], failed: [] });
    expect(mockSendWeekly).toHaveBeenCalledWith('hh-1', SEND_TIME);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("keeps going when one household's send throws and reports it as failed", async () => {
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }, { id: 'hh-2' }]);
    mockSendWeekly.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(true);

    const res = await GET(request());
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      sent: ['hh-2'],
      failed: [{ householdId: 'hh-1', error: 'db down' }],
    });
    expect(mockSendWeekly).toHaveBeenCalledTimes(2);
    // Logged to cron_run_logs as a failed run.
    expect(mockPrisma.cronRunLog.create.mock.calls[0][0].data.success).toBe(false);
  });
});
