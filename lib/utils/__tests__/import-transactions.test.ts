/**
 * Focused unit tests for importTransactions.
 *
 * Covers the moneytorId back-stamp path (looked at as part of the HUF
 * currency-merge fix) plus a baseline happy path. Does NOT attempt to
 * exercise every dedup strategy in the function (generic CC dedup, Riseup
 * category auto-creation, payee category rules) — those are out of scope
 * for this pass.
 */

import type { ImportTransactionInput } from '@/lib/validations/budget';

// --- Prisma mock -----------------------------------------------------------

jest.mock('@/lib/db', () => ({
  prisma: {
    ccGenericPayeeName: { findMany: jest.fn() },
    payeeCategoryRule: { findMany: jest.fn() },
    budgetPayee: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    riseupCategory: { findMany: jest.fn(), create: jest.fn() },
    budgetTransaction: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { importTransactions } from '../import-transactions';

type ExistingRow = {
  id: string;
  payeeName: string | null;
  amountIls: number;
  transactionDate: Date;
  moneytorId: string | null;
};

function makeExisting(rows: ExistingRow[]) {
  return rows.map((r) => ({
    id: r.id,
    payee: r.payeeName ? { name: r.payeeName } : null,
    amountIls: r.amountIls,
    transactionDate: r.transactionDate,
    moneytorId: r.moneytorId,
  }));
}

/** Builds a minimal ImportTransactionInput, casting past the zod-inferred
 * required fields so tests can deliberately omit currency/amountOriginal. */
function makeIncoming(overrides: Record<string, unknown>): ImportTransactionInput {
  return {
    type: 'expense',
    transactionDate: '2026-01-10',
    paymentDate: null,
    amountIls: 100,
    currency: 'ILS',
    amountOriginal: 100,
    payeeName: 'Some Store',
    riseupCategory: null,
    paymentMethod: 'credit_card',
    paymentNumber: null,
    totalPayments: null,
    notes: null,
    source: 'manual',
    paymentIdentifier: null,
    excludedFromFlow: false,
    moneytorId: undefined,
    ...overrides,
  } as unknown as ImportTransactionInput;
}

describe('importTransactions', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    (prisma.ccGenericPayeeName.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.budgetPayee.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.riseupCategory.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.budgetTransaction.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.budgetTransaction.update as jest.Mock).mockResolvedValue({});
    (prisma.budgetTransaction.create as jest.Mock).mockResolvedValue({ id: 'new-tx-id' });
    (prisma.budgetPayee.create as jest.Mock).mockResolvedValue({ id: 'payee-id' });
  });

  /** Wires budgetTransaction.findMany to serve both queries the function makes:
   * the main date-range dedup query, and the out-of-window moneytorId lookup. */
  function wireExisting(rows: ExistingRow[]) {
    const existing = makeExisting(rows);
    (prisma.budgetTransaction.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where: { moneytorId?: { in: string[] } } }) => {
        if (where.moneytorId) {
          return existing
            .filter((tx) => tx.moneytorId && where.moneytorId!.in.includes(tx.moneytorId))
            .map((tx) => ({ moneytorId: tx.moneytorId }));
        }
        return existing;
      }
    );
  }

  it('back-stamps only moneytorId on dedup-key collision, never currency/amountOriginal', async () => {
    // The dedup key is (date, payee, amountIls) with no currency in it, and a
    // foreign transaction's amountIls is its raw un-converted number — so this
    // "existing-1" row could genuinely be an unrelated ₪100 transaction that
    // happens to share a key with a 100-unit foreign charge. Back-stamping its
    // currency/amount here would risk silently corrupting a correct row on a
    // coincidental match; only the id (low-risk to mis-attach) should move.
    wireExisting([
      {
        id: 'existing-1',
        payeeName: 'Some Store',
        amountIls: 100,
        transactionDate: new Date('2026-01-10'),
        moneytorId: null,
      },
    ]);

    const incoming = makeIncoming({
      moneytorId: 'MT_123',
      currency: 'HUF',
      amountOriginal: 31700,
    });

    const result = await importTransactions('hh_1', [incoming]);

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.created).toBe(0);
    expect(prisma.budgetTransaction.create).not.toHaveBeenCalled();
    expect(prisma.budgetTransaction.update).toHaveBeenCalledWith({
      where: { id: 'existing-1' },
      data: { moneytorId: 'MT_123' },
    });
  });

  it('does not back-stamp when the existing row already has a moneytorId', async () => {
    wireExisting([
      {
        id: 'existing-1',
        payeeName: 'Some Store',
        amountIls: 100,
        transactionDate: new Date('2026-01-10'),
        moneytorId: 'MT_OLD',
      },
    ]);

    const incoming = makeIncoming({
      moneytorId: 'MT_NEW',
      currency: 'HUF',
      amountOriginal: 31700,
    });

    const result = await importTransactions('hh_1', [incoming]);

    expect(result.duplicatesSkipped).toBe(1);
    expect(prisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('creates a new transaction when there is no duplicate (baseline happy path)', async () => {
    wireExisting([]);

    const incoming = makeIncoming({ payeeName: 'Brand New Payee' });

    const result = await importTransactions('hh_1', [incoming]);

    expect(result.created).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.payeesCreated).toEqual(['Brand New Payee']);
    expect(prisma.budgetPayee.create).toHaveBeenCalledWith({
      data: { name: 'Brand New Payee', householdId: 'hh_1' },
    });
    expect(prisma.budgetTransaction.create).toHaveBeenCalledTimes(1);
  });
});
