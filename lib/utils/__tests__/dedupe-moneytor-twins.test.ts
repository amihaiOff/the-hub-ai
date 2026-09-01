import { dedupeMoneytorTwinsForHousehold } from '../dedupe-moneytor-twins';

// Minimal in-memory prisma double. Each call is captured; findMany returns
// the seeded rows; updates mutate the seeded array so a second pass sees the
// merge and no longer matches (idempotency).
type Row = {
  id: string;
  payeeId: string | null;
  amountIls: number;
  transactionDate: Date;
  moneytorId: string | null;
  categoryId: string | null;
  mergedFromId: string | null;
  isDeleted: boolean;
};

function makeMockPrisma(rows: Row[]) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const budgetTransaction = {
    async findMany({ where }: { where: { source: string; isDeleted: boolean } }) {
      return rows
        .filter((r) => !r.isDeleted && where.source === 'moneytor_sync')
        .map((r) => ({
          ...r,
          amountIls: { toString: () => r.amountIls.toFixed(2) } as unknown as number,
        }));
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      updates.push({ id: where.id, data });
      const row = rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };
  const $transaction = async (ops: unknown[]) => {
    for (const op of ops) await op;
    return [];
  };
  return { budgetTransaction, $transaction, updates };
}

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      budgetTransaction: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    },
  };
});

// Wire the mocks per-test via require, so each test resets state.
import { prisma } from '@/lib/db';

describe('dedupeMoneytorTwinsForHousehold', () => {
  const HH = 'hh_test';

  beforeEach(() => {
    (prisma.budgetTransaction.findMany as jest.Mock).mockReset();
    (prisma.budgetTransaction.update as jest.Mock).mockReset();
    (prisma.$transaction as jest.Mock).mockReset();
  });

  function wire(rows: Row[]) {
    const state = makeMockPrisma(rows);
    (prisma.budgetTransaction.findMany as jest.Mock).mockImplementation(
      state.budgetTransaction.findMany
    );
    (prisma.budgetTransaction.update as jest.Mock).mockImplementation(
      state.budgetTransaction.update
    );
    (prisma.$transaction as jest.Mock).mockImplementation(state.$transaction);
    return state;
  }

  it('merges a pending row (null moneytorId) with its settled twin within 7 days', async () => {
    const rows: Row[] = [
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date('2026-08-21'),
        moneytorId: null,
        categoryId: 'cat_food',
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date('2026-08-25'),
        moneytorId: 'MT_SETTLED',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);

    // Twin soft-deleted + its moneytorId cleared to free the unique constraint.
    const twinUpdate = state.updates.find((u) => u.id === 'settled');
    expect(twinUpdate?.data).toEqual({ moneytorId: null, isDeleted: true });

    // Survivor gets the moneytorId, keeps its category, records mergedFromId.
    const survivorUpdate = state.updates.find((u) => u.id === 'pending');
    expect(survivorUpdate?.data).toEqual({
      moneytorId: 'MT_SETTLED',
      categoryId: 'cat_food',
      mergedFromId: 'settled',
    });
  });

  it('leaves recurring same-amount rows alone when both have moneytorIds', async () => {
    // Two legitimately separate bus fares 15 days apart, each with its own
    // moneytorId — must not be merged even though the payee/amount match.
    const rows: Row[] = [
      {
        id: 'r1',
        payeeId: 'bus',
        amountIls: 8,
        transactionDate: new Date('2026-08-05'),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: 'bus',
        amountIls: 8,
        transactionDate: new Date('2026-08-20'),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(0);
    expect(prisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('does not merge rows more than 7 days apart', async () => {
    const rows: Row[] = [
      {
        id: 'r1',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date('2026-08-01'),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date('2026-08-15'),
        moneytorId: 'MT_X',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(0);
  });

  it('is idempotent — a second run after a merge does not merge again', async () => {
    const rows: Row[] = [
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date('2026-08-21'),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date('2026-08-25'),
        moneytorId: 'MT_S',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const first = await dedupeMoneytorTwinsForHousehold(HH);
    expect(first.merged).toBe(1);

    const second = await dedupeMoneytorTwinsForHousehold(HH);
    expect(second.merged).toBe(0);
  });
});
