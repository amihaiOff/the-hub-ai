/**
 * @jest-environment node
 *
 * Tests for the moneytor_transactions → budget_transactions promotion step
 * inside syncMoneytorForHousehold. The Moneytor API fetch + the
 * importTransactions helper are mocked; we only assert the mapping shape and
 * the dedup-by-moneytorId behaviour the sync code is responsible for.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorTransaction: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    moneytorStockHolding: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    moneytorStockSnapshot: {
      upsert: jest.fn(),
    },
    moneytorAccount: {
      upsert: jest.fn(),
    },
    moneytorAccountSnapshot: {
      upsert: jest.fn(),
    },
    moneytorPensionFund: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    moneytorPensionSnapshot: {
      upsert: jest.fn(),
    },
    budgetTransaction: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((calls) => Promise.all(calls)),
  },
}));

jest.mock('@/lib/api/moneytor', () => ({
  fetchMoneytorTransactions: jest.fn(),
  fetchMoneytorAssets: jest.fn(),
  MoneytorApiError: class extends Error {},
}));

jest.mock('@/lib/utils/import-transactions', () => ({
  importTransactions: jest.fn(),
}));

import { syncMoneytorForHousehold } from '../moneytor-sync';
import { prisma } from '@/lib/db';
import { fetchMoneytorTransactions, fetchMoneytorAssets } from '../moneytor';
import { importTransactions } from '@/lib/utils/import-transactions';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFetchTransactions = fetchMoneytorTransactions as jest.MockedFunction<
  typeof fetchMoneytorTransactions
>;
const mockFetchAssets = fetchMoneytorAssets as jest.MockedFunction<typeof fetchMoneytorAssets>;
const mockImportTransactions = importTransactions as jest.MockedFunction<typeof importTransactions>;

describe('syncMoneytorForHousehold → budget_transactions promotion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Sync of the moneytor_transactions table itself succeeds with no rows
    // (we don't care about the first two phases in these tests).
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);
    mockFetchTransactions.mockResolvedValue([]);
    mockFetchAssets.mockResolvedValue([]);
  });

  it('promotes a moneytor row into budget_transactions via importTransactions', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mt-1',
        transactionDate: new Date('2026-05-15T00:00:00Z'),
        amount: -150,
        currency: 'ILS',
        description: 'STARBUCKS TLV',
        category: 'COFFEE_&_SNACKS',
        accountId: 'AAA_LONG_ACCOUNT_ID_SUFFIX',
        type: 'CARD',
      },
    ]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([]);
    mockImportTransactions.mockResolvedValue({
      created: 1,
      duplicatesSkipped: 0,
      payeesCreated: ['STARBUCKS TLV'],
    });

    const summary = await syncMoneytorForHousehold('household-1');

    expect(summary.budgetCreated).toBe(1);
    expect(summary.budgetSkipped).toBe(0);
    expect(mockImportTransactions).toHaveBeenCalledTimes(1);
    const [householdId, inputs] = mockImportTransactions.mock.calls[0];
    expect(householdId).toBe('household-1');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      type: 'expense', // negative amount → expense
      transactionDate: '2026-05-15',
      amountIls: 150, // abs
      amountOriginal: 150,
      currency: 'ILS',
      payeeName: 'STARBUCKS TLV',
      paymentMethod: 'credit_card', // CARD → credit_card
      paymentIdentifier: 'CCOUNT_ID_SUFFIX'.slice(-12), // last 12 chars of accountId
      source: 'moneytor_sync',
      moneytorId: 'mt-1',
    });
  });

  it('skips moneytor rows already promoted (idempotent)', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mt-already',
        transactionDate: new Date('2026-05-15T00:00:00Z'),
        amount: -50,
        currency: 'ILS',
        description: 'X',
        category: 'OTHER',
        accountId: 'AAA',
        type: 'CARD',
      },
    ]);
    // Already in budget_transactions:
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([
      { moneytorId: 'mt-already' },
    ]);

    const summary = await syncMoneytorForHousehold('household-1');

    expect(summary.budgetCreated).toBe(0);
    expect(summary.budgetSkipped).toBe(0);
    // importTransactions should not be called because the input list is empty
    expect(mockImportTransactions).not.toHaveBeenCalled();
  });

  it('derives income from positive amounts and maps CHECKING to bank_transfer', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mt-salary',
        transactionDate: new Date('2026-05-01T00:00:00Z'),
        amount: 10000,
        currency: 'ILS',
        description: 'EMPLOYER LTD',
        category: 'INCOME',
        accountId: 'CHK_ACCOUNT',
        type: 'CHECKING',
      },
    ]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([]);
    mockImportTransactions.mockResolvedValue({
      created: 1,
      duplicatesSkipped: 0,
      payeesCreated: [],
    });

    await syncMoneytorForHousehold('household-1');

    const inputs = mockImportTransactions.mock.calls[0][1];
    expect(inputs[0]).toMatchObject({
      type: 'income',
      amountIls: 10000,
      paymentMethod: 'bank_transfer',
    });
  });

  it('returns duplicatesSkipped from importTransactions as budgetSkipped', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mt-conflict',
        transactionDate: new Date('2026-05-15T00:00:00Z'),
        amount: -100,
        currency: 'ILS',
        description: 'CONFLICT VENDOR',
        category: 'GROCERIES',
        accountId: 'AAAA',
        type: 'CARD',
      },
    ]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([]);
    // Pre-existing CSV row at same date/payee/amount: importTransactions reports the skip
    mockImportTransactions.mockResolvedValue({
      created: 0,
      duplicatesSkipped: 1,
      payeesCreated: [],
    });

    const summary = await syncMoneytorForHousehold('household-1');

    expect(summary.budgetCreated).toBe(0);
    expect(summary.budgetSkipped).toBe(1);
  });
});

describe('syncMoneytorForHousehold → fetch date window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchTransactions.mockResolvedValue([]);
    mockFetchAssets.mockResolvedValue([]);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('on first sync (no stored rows) fetches only from May 2026 onward', async () => {
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);

    await syncMoneytorForHousehold('household-1');

    expect(mockFetchTransactions).toHaveBeenCalledWith({ from: '2026-05-01' });
  });

  it('on subsequent syncs fetches from latest transaction date minus 7-day safety window', async () => {
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue({
      transactionDate: new Date('2026-06-10T00:00:00Z'),
    });

    await syncMoneytorForHousehold('household-1');

    expect(mockFetchTransactions).toHaveBeenCalledWith({ from: '2026-06-03' });
  });
});
