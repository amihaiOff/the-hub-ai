/**
 * @jest-environment node
 *
 * Tests for the bank + debt account promotion step inside
 * syncMoneytorForHousehold. Mocks the Moneytor API + Prisma so we can
 * assert the normalisation logic (sign flip for debts, field mapping) and
 * the snapshot upsert behaviour.
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
    budgetTransaction: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((calls) => Promise.all(calls)),
  },
}));

jest.mock('@/lib/api/moneytor', () => ({
  fetchMoneytorTransactions: jest.fn(),
  fetchMoneytorAssets: jest.fn(),
  fetchMoneytorShareAssets: jest.fn(),
  MoneytorApiError: class extends Error {},
}));

jest.mock('@/lib/utils/import-transactions', () => ({
  importTransactions: jest.fn().mockResolvedValue({
    created: 0,
    duplicatesSkipped: 0,
    payeesCreated: [],
  }),
}));

import { syncMoneytorForHousehold } from '../moneytor-sync';
import { prisma } from '@/lib/db';
import { fetchMoneytorTransactions, fetchMoneytorAssets } from '../moneytor';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFetchTransactions = fetchMoneytorTransactions as jest.MockedFunction<
  typeof fetchMoneytorTransactions
>;
const mockFetchAssets = fetchMoneytorAssets as jest.MockedFunction<typeof fetchMoneytorAssets>;

describe('syncMoneytorForHousehold → bank + debt accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.moneytorTransaction.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.moneytorTransaction.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValue([]);
    mockFetchTransactions.mockResolvedValue([]);
  });

  it('upserts a bank asset with positive balanceInBase and the right field mapping', async () => {
    mockFetchAssets.mockResolvedValue([
      {
        id: '6255',
        productId: 6255,
        form: 'bank',
        name: 'בנק הפועלים עו"ש',
        bank: 'הפועלים',
        accountType: { value: 'balance', name: 'עו"ש' },
        accountNumber: '12345678',
        amount: 1000,
        interest: 0.5,
        balanceInBaseCurrency: 1000,
        currency: { value: 'ILS' },
      },
    ]);

    const summary = await syncMoneytorForHousehold('hh-1');

    expect(summary.accountsUpserted).toBe(1);
    expect(summary.accountSnapshotsUpserted).toBe(1);

    const call = (mockPrisma.moneytorAccount.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create).toMatchObject({
      productId: '6255',
      form: 'bank',
      institution: 'הפועלים',
      subtype: 'balance',
      accountNumber: '12345678',
      currency: 'ILS',
      balanceInBase: 1000,
      interestRate: 0.5,
      householdId: 'hh-1',
    });
  });

  it('flips sign for debt assets and pulls subtype from debtType', async () => {
    mockFetchAssets.mockResolvedValue([
      {
        id: '7700',
        productId: 7700,
        form: 'debt',
        name: 'משכנתא',
        debtInstitution: 'בנק לאומי',
        debtType: 'mortgage',
        balanceInBaseCurrency: 500000,
        currency: { value: 'ILS' },
        routesData: [
          { remainder: 300000, interest: 3.5, monthlyRepayment: 2000 },
          { remainder: 200000, interest: 2.5, monthlyRepayment: 1500 },
        ],
      },
    ]);

    await syncMoneytorForHousehold('hh-1');

    const call = (mockPrisma.moneytorAccount.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.balanceInBase).toBe(-500000); // sign flipped
    expect(call.create.subtype).toBe('mortgage');
    expect(call.create.institution).toBe('בנק לאומי');
    // Weighted-avg interest: (3.5 * 300k + 2.5 * 200k) / 500k = 3.1
    expect(call.create.interestRate).toBeCloseTo(3.1, 5);
    expect(call.create.monthlyPayment).toBe(3500); // 2000 + 1500
  });

  it('writes a snapshot row for today keyed on (householdId, snapshotDate, productId)', async () => {
    mockFetchAssets.mockResolvedValue([
      {
        id: '6255',
        productId: 6255,
        form: 'bank',
        name: 'Bank A',
        bank: 'Bank',
        balanceInBaseCurrency: 1234,
        currency: { value: 'ILS' },
      },
    ]);

    await syncMoneytorForHousehold('hh-1');

    const snapCall = (mockPrisma.moneytorAccountSnapshot.upsert as jest.Mock).mock.calls[0][0];
    expect(snapCall.where.householdId_snapshotDate_productId.householdId).toBe('hh-1');
    expect(snapCall.where.householdId_snapshotDate_productId.productId).toBe('6255');
    expect(snapCall.create.balanceInBase).toBe(1234);
    expect(snapCall.create.form).toBe('bank');
  });

  it('skips assets that are not bank or debt', async () => {
    mockFetchAssets.mockResolvedValue([
      { id: '1', productId: 1, form: 'crypto', name: 'BTC wallet' },
      { id: '2', productId: 2, form: 'pension', name: 'Pension X' },
      { id: '3', productId: 3, form: 'realestate', name: 'Apartment' },
    ]);

    const summary = await syncMoneytorForHousehold('hh-1');
    expect(summary.accountsUpserted).toBe(0);
    expect(summary.accountSnapshotsUpserted).toBe(0);
    expect((mockPrisma.moneytorAccount.upsert as jest.Mock).mock.calls).toHaveLength(0);
  });
});
