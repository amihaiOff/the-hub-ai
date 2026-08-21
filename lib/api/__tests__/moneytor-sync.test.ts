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
      deleteMany: jest.fn(),
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
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
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
    moneytorRealEstate: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    moneytorRealEstateSnapshot: {
      upsert: jest.fn(),
    },
    budgetTransaction: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    budgetTransactionTag: {
      create: jest.fn(),
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

import {
  syncMoneytorForHousehold,
  forceResyncMoneytorTransactionsForHousehold,
  ForceResyncRangeError,
} from '../moneytor-sync';
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

describe('forceResyncMoneytorTransactionsForHousehold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchTransactions.mockResolvedValue([]);
    (mockPrisma.moneytorTransaction.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.moneytorTransaction.upsert as jest.Mock).mockResolvedValue({});
    (mockPrisma.budgetTransaction.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.budgetTransactionTag.create as jest.Mock).mockResolvedValue({});
  });

  it('rejects pre-cutoff ranges', async () => {
    await expect(
      forceResyncMoneytorTransactionsForHousehold('household-1', {
        from: '2026-04-01',
        to: '2026-04-30',
      })
    ).rejects.toBeInstanceOf(ForceResyncRangeError);
  });

  it('rejects from > to', async () => {
    await expect(
      forceResyncMoneytorTransactionsForHousehold('household-1', {
        from: '2026-06-10',
        to: '2026-06-01',
      })
    ).rejects.toBeInstanceOf(ForceResyncRangeError);
  });

  it('fuzzy-matches a fresh row to an existing one and re-points the linked budget_transaction', async () => {
    // existingMoneytor read (step 1)
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'mt-old',
          description: 'COFFEE SHOP',
          transactionDate: new Date('2026-06-05T00:00:00Z'),
          amount: -42.5,
          accountId: 'CHK-001',
        },
      ])
      // freshMoneytorRows read after upsert (step 7 first call)
      .mockResolvedValueOnce([
        {
          id: 'mt-new',
          transactionDate: new Date('2026-06-05T00:00:00Z'),
          amount: -42.5,
          currency: 'ILS',
          description: 'COFFEE SHOP',
          category: 'COFFEE',
          accountId: 'CHK-001',
          type: 'CARD',
        },
      ]);

    // linkedBudget read for re-link (step 5)
    (mockPrisma.budgetTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'bt-1', moneytorId: 'mt-old' }])
      // alreadyLinked read in promote step (step 7) — after re-link, bt-1 already points at mt-new
      .mockResolvedValueOnce([{ moneytorId: 'mt-new' }]);

    (mockPrisma.moneytorTransaction.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    mockFetchTransactions.mockResolvedValue([
      {
        id: 'mt-new', // Moneytor reassigned the id
        date: '2026-06-05',
        amount: -42.5,
        currency: 'ILS',
        description: 'COFFEE SHOP',
        category: 'COFFEE',
        accountId: 'CHK-001',
        type: 'CARD',
      },
    ]);

    const summary = await forceResyncMoneytorTransactionsForHousehold('household-1', {
      from: '2026-06-01',
      to: '2026-06-10',
    });

    expect(summary.fetched).toBe(1);
    expect(summary.editsPreserved).toBe(1);
    expect(summary.budgetCreated).toBe(0); // nothing new to promote
    expect(summary.deletedBudget).toBe(0); // re-linked, not deleted

    // The old budget row's moneytorId was re-pointed to the fresh id.
    expect(mockPrisma.budgetTransaction.update).toHaveBeenCalledWith({
      where: { id: 'bt-1' },
      data: { moneytorId: 'mt-new' },
    });

    // The upsert call stamped replacesMoneytorId so we have an audit trail.
    const upsertCall = (mockPrisma.moneytorTransaction.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertCall.create.replacesMoneytorId).toBe('mt-old');
    expect(upsertCall.update.replacesMoneytorId).toBe('mt-old');

    // Old moneytor row was deleted (id not in the fresh id set).
    expect(mockPrisma.moneytorTransaction.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', id: { in: ['mt-old'] } },
    });
  });

  it('deletes orphaned budget_transactions when their moneytor row has no fresh match', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'mt-orphan',
          description: 'DUPLICATE',
          transactionDate: new Date('2026-06-05T00:00:00Z'),
          amount: -10,
          accountId: 'CHK-001',
        },
      ])
      .mockResolvedValueOnce([]); // no fresh rows post-resync

    (mockPrisma.budgetTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'bt-orphan', moneytorId: 'mt-orphan' }])
      .mockResolvedValueOnce([]);

    (mockPrisma.budgetTransaction.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.moneytorTransaction.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    // Moneytor returns nothing in the range (data corrected away)
    mockFetchTransactions.mockResolvedValue([]);

    const summary = await forceResyncMoneytorTransactionsForHousehold('household-1', {
      from: '2026-06-01',
      to: '2026-06-10',
    });

    expect(summary.fetched).toBe(0);
    expect(summary.deletedBudget).toBe(1);
    expect(summary.editsPreserved).toBe(0);

    expect(mockPrisma.budgetTransaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['bt-orphan'] } },
    });
  });

  it('promotes a brand new fresh row that has no existing match', async () => {
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // no existing rows in range
      .mockResolvedValueOnce([
        {
          id: 'mt-new-only',
          transactionDate: new Date('2026-06-05T00:00:00Z'),
          amount: -25,
          currency: 'ILS',
          description: 'NEW STORE',
          category: 'GROCERIES',
          accountId: 'CHK-001',
          type: 'CARD',
        },
      ]);

    (mockPrisma.budgetTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // no linked rows
      .mockResolvedValueOnce([]); // not yet promoted

    mockFetchTransactions.mockResolvedValue([
      {
        id: 'mt-new-only',
        date: '2026-06-05',
        amount: -25,
        currency: 'ILS',
        description: 'NEW STORE',
        category: 'GROCERIES',
        accountId: 'CHK-001',
        type: 'CARD',
      },
    ]);

    mockImportTransactions.mockResolvedValue({
      created: 1,
      duplicatesSkipped: 0,
      payeesCreated: [],
    });

    const summary = await forceResyncMoneytorTransactionsForHousehold('household-1', {
      from: '2026-06-01',
      to: '2026-06-10',
    });

    expect(summary.budgetCreated).toBe(1);
    expect(summary.editsPreserved).toBe(0);
    expect(summary.deletedBudget).toBe(0);
  });

  it('preserves a categorized budget row when Moneytor keeps the id but corrects the fields', async () => {
    // A pending card charge settles: same Moneytor id, but the date/amount/
    // description all drift. The old snapshot (step 1) has the pending values;
    // the fresh fetch has the settled ones. The budget row (with the user's
    // category) must survive untouched — not be deleted + recreated uncategorized.
    (mockPrisma.moneytorTransaction.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'mt-x',
          description: 'PENDING AUTH',
          transactionDate: new Date('2026-06-05T00:00:00Z'),
          amount: -100,
          accountId: 'CHK-001',
        },
      ])
      // freshMoneytorRows read (step 7) — same id, corrected fields
      .mockResolvedValueOnce([
        {
          id: 'mt-x',
          transactionDate: new Date('2026-06-06T00:00:00Z'),
          amount: -105,
          currency: 'ILS',
          description: 'MERCHANT XYZ',
          category: 'DINING',
          accountId: 'CHK-001',
          type: 'CARD',
        },
      ]);

    (mockPrisma.budgetTransaction.findMany as jest.Mock)
      // linkedBudget (step 5) — the categorized row still points at mt-x
      .mockResolvedValueOnce([{ id: 'bt-x', moneytorId: 'mt-x' }])
      // alreadyLinked (step 7) — still linked because we preserved it
      .mockResolvedValueOnce([{ moneytorId: 'mt-x' }]);

    mockFetchTransactions.mockResolvedValue([
      {
        id: 'mt-x', // same id, drifted fields
        date: '2026-06-06',
        amount: -105,
        currency: 'ILS',
        description: 'MERCHANT XYZ',
        category: 'DINING',
        accountId: 'CHK-001',
        type: 'CARD',
      },
    ]);

    const summary = await forceResyncMoneytorTransactionsForHousehold('household-1', {
      from: '2026-06-01',
      to: '2026-06-10',
    });

    // The budget row is neither deleted nor recreated.
    expect(summary.deletedBudget).toBe(0);
    expect(summary.budgetCreated).toBe(0);
    expect(mockPrisma.budgetTransaction.deleteMany).not.toHaveBeenCalled();
    expect(mockImportTransactions).not.toHaveBeenCalled();
    // No re-point needed (same id), so no budget update either.
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
    // The stale Moneytor id is NOT deleted — it's still live.
    expect(mockPrisma.moneytorTransaction.deleteMany).not.toHaveBeenCalled();
  });
});
