/**
 * @jest-environment node
 *
 * GET /api/cron/daily-tasks — a failed Moneytor sync pushes a "Bank sync
 * failed" notification to that household's devices.
 *
 * Kept separate from cron.test.ts: this suite controls MONEYTOR_API_TOKEN
 * itself and mocks the Moneytor sync module.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    stockHolding: { findMany: jest.fn() },
    pensionAccount: { findMany: jest.fn() },
    household: { findMany: jest.fn() },
    cronRunLog: { create: jest.fn() },
  },
}));

jest.mock('@/lib/api/stock-price', () => ({
  updateStockPriceCache: jest.fn(),
  isStockPriceError: jest.fn(),
}));

jest.mock('@/lib/api/moneytor-sync', () => ({
  syncMoneytorForHouseholdAndLog: jest.fn(),
}));

jest.mock('@/lib/ai/drain-suggestions', () => ({
  drainSuggestions: jest.fn(),
}));

jest.mock('@/lib/api/boi-prime', () => ({
  readBoiPrimeOverride: jest.fn(),
  scrapeBoiPrimeViaLlm: jest.fn(),
  upsertBoiPrimeIfChanged: jest.fn(),
  logBoiPrimeFetch: jest.fn(),
}));

jest.mock('@/lib/notifications/push', () => ({
  sendPushToHousehold: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMoneytorForHouseholdAndLog } from '@/lib/api/moneytor-sync';
import { MoneytorApiError } from '@/lib/api/moneytor';
import { drainSuggestions } from '@/lib/ai/drain-suggestions';
import { readBoiPrimeOverride, logBoiPrimeFetch } from '@/lib/api/boi-prime';
import { sendPushToHousehold } from '@/lib/notifications/push';
import { GET } from '../daily-tasks/route';

const mockPrisma = prisma as unknown as {
  stockHolding: { findMany: jest.Mock };
  pensionAccount: { findMany: jest.Mock };
  household: { findMany: jest.Mock };
  cronRunLog: { create: jest.Mock };
};
const mockSync = syncMoneytorForHouseholdAndLog as jest.MockedFunction<
  typeof syncMoneytorForHouseholdAndLog
>;
const mockSend = sendPushToHousehold as jest.MockedFunction<typeof sendPushToHousehold>;

const originalToken = process.env.MONEYTOR_API_TOKEN;

const okSummary = {
  upserted: 3,
  stocksUpserted: 0,
  snapshotsUpserted: 0,
  accountsUpserted: 0,
  accountSnapshotsUpserted: 0,
  budgetCreated: 0,
  budgetSkipped: 0,
} as unknown as Awaited<ReturnType<typeof syncMoneytorForHouseholdAndLog>>;

function request() {
  return new NextRequest('http://localhost/api/cron/daily-tasks');
}

describe('GET /api/cron/daily-tasks — Moneytor failure push', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.MONEYTOR_API_TOKEN = 'test-token';
    mockPrisma.stockHolding.findMany.mockResolvedValue([]);
    mockPrisma.pensionAccount.findMany.mockResolvedValue([]);
    mockPrisma.household.findMany.mockResolvedValue([{ id: 'hh-1' }, { id: 'hh-2' }]);
    mockPrisma.cronRunLog.create.mockResolvedValue({});
    (drainSuggestions as jest.Mock).mockResolvedValue(null);
    (readBoiPrimeOverride as jest.Mock).mockReturnValue(null);
    (logBoiPrimeFetch as jest.Mock).mockResolvedValue(undefined);
    mockSend.mockResolvedValue(1);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    if (originalToken === undefined) delete process.env.MONEYTOR_API_TOKEN;
    else process.env.MONEYTOR_API_TOKEN = originalToken;
  });

  it('pushes "Bank sync failed" to the household whose sync threw', async () => {
    mockSync.mockRejectedValueOnce(new Error('Moneytor is down')).mockResolvedValueOnce(okSummary);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.moneytor.failures).toEqual([
      { householdId: 'hh-1', error: 'Moneytor is down' },
    ]);
    expect(json.results.moneytor.households).toBe(1);

    expect(mockSend).toHaveBeenCalledTimes(1);
    // The raw error stays in the sync log, never on the lock screen.
    expect(mockSend.mock.calls[0][1].body).not.toContain('Moneytor is down');
    expect(mockSend).toHaveBeenCalledWith('hh-1', {
      title: 'Bank sync failed',
      body: "Today's bank sync didn't go through. Tap to see the sync log.",
      url: '/labs/sync-log',
      tag: 'moneytor-sync',
    });
  });

  it('does not push when every sync succeeds', async () => {
    mockSync.mockResolvedValue(okSummary);

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('pushes once and stops on an expired token', async () => {
    mockSync.mockRejectedValue(new MoneytorApiError('Token expired', 'token_expired', 401));

    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      'hh-1',
      expect.objectContaining({ title: 'Bank sync failed', url: '/labs/sync-log' })
    );
    expect((await res.json()).results.moneytor.failures).toEqual([
      { householdId: 'hh-1', error: 'Token expired', code: 'token_expired' },
    ]);
  });

  it('skips Moneytor (and pushes nothing) when MONEYTOR_API_TOKEN is unset', async () => {
    delete process.env.MONEYTOR_API_TOKEN;

    const res = await GET(request());
    expect((await res.json()).results.moneytor.skipped).toBe('MONEYTOR_API_TOKEN not set');
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
