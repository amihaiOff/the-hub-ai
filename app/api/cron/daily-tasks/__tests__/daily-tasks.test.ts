/**
 * @jest-environment node
 *
 * Focused coverage for /api/cron/daily-tasks. The broader stock-price /
 * pension paths are covered by app/api/cron/__tests__/cron.test.ts; this
 * suite exercises the Moneytor-sync branches (skip / success / per-household
 * failure / early-break on token errors) plus the production auth guard, none
 * of which the sibling suite touches because it never sets MONEYTOR_API_TOKEN.
 */

import { NextRequest } from 'next/server';

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
  isStockPriceError: jest.fn((result) => 'error' in result),
}));

jest.mock('@/lib/api/moneytor-sync', () => ({
  syncMoneytorForHouseholdAndLog: jest.fn(),
}));

// The AI categorization drain is covered in drain-suggestions.test.ts; here it
// must not touch the DB or run the model, so stub it with a benign result.
jest.mock('@/lib/ai/drain-suggestions', () => ({
  drainSuggestions: jest.fn().mockResolvedValue({
    householdsProcessed: 0,
    processed: 0,
    suggested: 0,
    lowConfidence: 0,
    noMatch: 0,
    errors: 0,
    timedOut: false,
    skipped: [],
  }),
}));

// Provide a real error class so the route's `instanceof MoneytorApiError`
// checks (and the token-error early-break) behave as in production.
jest.mock('@/lib/api/moneytor', () => {
  class MoneytorApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'MoneytorApiError';
      this.code = code;
    }
  }
  return { MoneytorApiError };
});

import { GET } from '../route';
import { prisma } from '@/lib/db';
import { syncMoneytorForHouseholdAndLog } from '@/lib/api/moneytor-sync';
import { MoneytorApiError } from '@/lib/api/moneytor';
import { drainSuggestions } from '@/lib/ai/drain-suggestions';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockDrain = drainSuggestions as jest.MockedFunction<typeof drainSuggestions>;
const mockSync = syncMoneytorForHouseholdAndLog as jest.MockedFunction<
  typeof syncMoneytorForHouseholdAndLog
>;

const originalNodeEnv = process.env.NODE_ENV;

const SUMMARY = {
  upserted: 3,
  stocksUpserted: 2,
  snapshotsUpserted: 1,
  accountsUpserted: 1,
  accountSnapshotsUpserted: 1,
  budgetCreated: 1,
  budgetSkipped: 0,
} as Awaited<ReturnType<typeof syncMoneytorForHouseholdAndLog>>;

function req(headers?: Record<string, string>) {
  return new NextRequest(
    'http://localhost/api/cron/daily-tasks',
    headers ? { headers } : undefined
  );
}

describe('GET /api/cron/daily-tasks — Moneytor sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.MONEYTOR_API_TOKEN;
    // No stock symbols / pension accounts so those loops are trivial.
    (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
    });
  });

  it('skips Moneytor entirely when MONEYTOR_API_TOKEN is not set', async () => {
    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results.moneytor.skipped).toBe('MONEYTOR_API_TOKEN not set');
    expect(data.results.moneytor.households).toBe(0);
    expect(mockPrisma.household.findMany).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('aggregates per-household summaries on success', async () => {
    process.env.MONEYTOR_API_TOKEN = 'token';
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
      { id: 'hh-1' },
      { id: 'hh-2' },
    ]);
    mockSync.mockResolvedValue(SUMMARY);

    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(data.results.moneytor.households).toBe(2);
    expect(data.results.moneytor.transactionsUpserted).toBe(6);
    expect(data.results.moneytor.stocksUpserted).toBe(4);
    expect(data.results.moneytor.budgetCreated).toBe(2);
    expect(data.results.moneytor.failures).toHaveLength(0);
  });

  it('records a generic per-household failure and continues to the next', async () => {
    process.env.MONEYTOR_API_TOKEN = 'token';
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
      { id: 'hh-1' },
      { id: 'hh-2' },
    ]);
    mockSync.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(SUMMARY);
    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(2); // did not break early
    expect(data.results.moneytor.households).toBe(1);
    expect(data.results.moneytor.failures).toEqual([{ householdId: 'hh-1', error: 'boom' }]);
    errSpy.mockRestore();
  });

  it('breaks early on a token error (no point retrying every household)', async () => {
    process.env.MONEYTOR_API_TOKEN = 'token';
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
      { id: 'hh-1' },
      { id: 'hh-2' },
    ]);
    mockSync.mockRejectedValue(new MoneytorApiError('expired', 'token_expired'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(1); // stopped after the first failure
    expect(data.results.moneytor.failures).toEqual([
      { householdId: 'hh-1', error: 'expired', code: 'token_expired' },
    ]);
    errSpy.mockRestore();
  });

  it('rejects unauthorized requests in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    process.env.CRON_SECRET = 'secret';

    const res = await GET(req());
    expect(res.status).toBe(401);
    // Guard runs before any work.
    expect(mockPrisma.stockHolding.findMany).not.toHaveBeenCalled();
  });

  it('runs with a correct bearer token in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    process.env.CRON_SECRET = 'secret';

    const res = await GET(req({ authorization: 'Bearer secret' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('runs the AI categorization drain as a daily backstop and reports its result', async () => {
    mockDrain.mockResolvedValueOnce({
      householdsProcessed: 1,
      processed: 4,
      suggested: 3,
      lowConfidence: 0,
      noMatch: 1,
      errors: 0,
      timedOut: false,
      skipped: [],
    });

    const res = await GET(req());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockDrain).toHaveBeenCalledTimes(1);
    // Bounded by an absolute wall-clock deadline.
    expect(mockDrain).toHaveBeenCalledWith(expect.any(Number));
    expect(data.results.categorization).toMatchObject({ suggested: 3, noMatch: 1 });
  });
});
