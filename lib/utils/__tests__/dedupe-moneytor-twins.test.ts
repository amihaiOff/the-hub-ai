import {
  dedupeMoneytorTwinsForHousehold,
  TWIN_WINDOW_DAYS,
  WIDENED_TWIN_WINDOW_DAYS,
} from '../dedupe-moneytor-twins';

const DAY_MS = 24 * 60 * 60 * 1000;

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

  it('merges two rows that both already have a real moneytorId within 4 days', async () => {
    // Some feeds hand out a real moneytorId even for the not-yet-final row,
    // so neither side is null — the null-moneytorId rule above never fires.
    const rows: Row[] = [
      {
        id: 'earlier',
        payeeId: 'p1',
        amountIls: 2050,
        transactionDate: new Date('2026-06-03'),
        moneytorId: 'MT_A',
        categoryId: 'cat_transfer',
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'later',
        payeeId: 'p1',
        amountIls: 2050,
        transactionDate: new Date('2026-06-06'),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);

    // Twin soft-deleted, keeps its own moneytorId (nothing to move — both
    // sides already had a real one).
    const twinUpdate = state.updates.find((u) => u.id === 'later');
    expect(twinUpdate?.data).toEqual({ isDeleted: true });

    // Survivor is the earlier row, unchanged moneytorId, keeps its category.
    const survivorUpdate = state.updates.find((u) => u.id === 'earlier');
    expect(survivorUpdate?.data).toEqual({
      categoryId: 'cat_transfer',
      mergedFromId: 'later',
    });
  });

  it('does not merge two both-real-moneytorId rows more than 4 days apart', async () => {
    const rows: Row[] = [
      {
        id: 'r1',
        payeeId: 'p1',
        amountIls: 20,
        transactionDate: new Date('2026-07-02'),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: 'p1',
        amountIls: 20,
        transactionDate: new Date('2026-07-14'),
        moneytorId: 'MT_B',
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

  // --- Boundary conditions -------------------------------------------------

  it('merges rule 1 (null moneytorId) rows exactly TWIN_WINDOW_DAYS apart', async () => {
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date(start),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date(start + TWIN_WINDOW_DAYS * DAY_MS),
        moneytorId: 'MT_X',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);
  });

  it('does not merge rule 1 rows exactly TWIN_WINDOW_DAYS + 1ms apart', async () => {
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date(start),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date(start + TWIN_WINDOW_DAYS * DAY_MS + 1),
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

  it('merges rule 2 (both-real-id) rows exactly WIDENED_TWIN_WINDOW_DAYS apart', async () => {
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'earlier',
        payeeId: 'p1',
        amountIls: 50,
        transactionDate: new Date(start),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'later',
        payeeId: 'p1',
        amountIls: 50,
        transactionDate: new Date(start + WIDENED_TWIN_WINDOW_DAYS * DAY_MS),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);
  });

  it('does not merge rule 2 rows exactly WIDENED_TWIN_WINDOW_DAYS + 1ms apart', async () => {
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'earlier',
        payeeId: 'p1',
        amountIls: 50,
        transactionDate: new Date(start),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'later',
        payeeId: 'p1',
        amountIls: 50,
        transactionDate: new Date(start + WIDENED_TWIN_WINDOW_DAYS * DAY_MS + 1),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(0);
  });

  // --- Chain handling (3+ rows, rule 2) ------------------------------------

  it('merges only the nearest pair when 3 both-real-id rows are all pairwise within the rule-2 window, leaving the third unconsumed', async () => {
    // day0, day2, day4 — every pair is within the 4-day window (0-2=2,
    // 2-4=2, 0-4=4). The scan should pair the earliest two (0,2) and leave
    // the third (day4) alone rather than cascading it into either pair,
    // since each row may only be consumed once per sweep.
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'r0',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r1',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start + 2 * DAY_MS),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start + 4 * DAY_MS),
        moneytorId: 'MT_C',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);
    expect(result.candidates).toBe(3);

    // r0 (survivor) and r1 (twin) are touched; r2 is untouched.
    expect(state.updates.some((u) => u.id === 'r0')).toBe(true);
    expect(state.updates.some((u) => u.id === 'r1')).toBe(true);
    expect(state.updates.some((u) => u.id === 'r2')).toBe(false);
    expect(rows.find((r) => r.id === 'r2')?.isDeleted).toBe(false);
  });

  it('pairs the second and third rows when the first is out of window but the last two are close (rule 2)', async () => {
    // day0, day5, day6 — (0,5) and (0,6) exceed the 4-day window, but
    // (5,6) is within it. r0 should be left alone; r1+r2 should merge.
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'r0',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r1',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start + 5 * DAY_MS),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: 'p1',
        amountIls: 30,
        transactionDate: new Date(start + 6 * DAY_MS),
        moneytorId: 'MT_C',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(1);

    expect(state.updates.some((u) => u.id === 'r0')).toBe(false);
    const twinUpdate = state.updates.find((u) => u.id === 'r2');
    expect(twinUpdate?.data).toEqual({ isDeleted: true });
    const survivorUpdate = state.updates.find((u) => u.id === 'r1');
    expect(survivorUpdate?.data).toEqual({ categoryId: null, mergedFromId: 'r2' });
  });

  it('pairs two distinct null-moneytorId rows with two distinct settled partners in the same group (rule 1 chain)', async () => {
    // Two independent pending/settled pairs sharing the same payee+amount
    // group: pending1+settled1 close together, pending2+settled2 close
    // together, but the two pairs are far apart from each other. Each
    // pending should find its own nearest partner rather than double-
    // consuming or cross-matching.
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      {
        id: 'pending2',
        payeeId: 'p1',
        amountIls: 75,
        transactionDate: new Date(start + 30 * DAY_MS),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'pending1',
        payeeId: 'p1',
        amountIls: 75,
        transactionDate: new Date(start),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled1',
        payeeId: 'p1',
        amountIls: 75,
        transactionDate: new Date(start + 2 * DAY_MS),
        moneytorId: 'MT_1',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled2',
        payeeId: 'p1',
        amountIls: 75,
        transactionDate: new Date(start + 32 * DAY_MS),
        moneytorId: 'MT_2',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(2);

    expect(state.updates.find((u) => u.id === 'pending1')?.data).toMatchObject({
      moneytorId: 'MT_1',
      mergedFromId: 'settled1',
    });
    expect(state.updates.find((u) => u.id === 'pending2')?.data).toMatchObject({
      moneytorId: 'MT_2',
      mergedFromId: 'settled2',
    });
  });

  // --- Rule 1 + rule 2 interaction within the same group -------------------

  it('applies rule 1 and rule 2 independently within the same payee/amount group without cross-consuming rows', async () => {
    const start = new Date('2026-08-01').getTime();
    const rows: Row[] = [
      // Rule 1 pair: null-id pending + settled, 3 days apart.
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date(start),
        moneytorId: null,
        categoryId: 'cat_food',
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settled1',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date(start + 3 * DAY_MS),
        moneytorId: 'MT_A',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      // Rule 2 pair: both real ids, far away from the rule-1 pair (20+ days)
      // but only 2 days apart from each other, same payee/amount.
      {
        id: 'settledX',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date(start + 20 * DAY_MS),
        moneytorId: 'MT_B',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'settledY',
        payeeId: 'p1',
        amountIls: 258,
        transactionDate: new Date(start + 22 * DAY_MS),
        moneytorId: 'MT_C',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    const state = wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(2);
    expect(result.candidates).toBe(4);

    // Rule 1 pair merged as expected.
    expect(state.updates.find((u) => u.id === 'settled1')?.data).toEqual({
      moneytorId: null,
      isDeleted: true,
    });
    expect(state.updates.find((u) => u.id === 'pending')?.data).toEqual({
      moneytorId: 'MT_A',
      categoryId: 'cat_food',
      mergedFromId: 'settled1',
    });

    // Rule 2 pair merged independently, moneytorIds untouched.
    expect(state.updates.find((u) => u.id === 'settledY')?.data).toEqual({
      isDeleted: true,
    });
    expect(state.updates.find((u) => u.id === 'settledX')?.data).toEqual({
      categoryId: null,
      mergedFromId: 'settledY',
    });
  });

  // --- Exclusions ------------------------------------------------------------

  it('does not merge rows with a null payeeId even if amount/date otherwise match', async () => {
    const rows: Row[] = [
      {
        id: 'r1',
        payeeId: null,
        amountIls: 258,
        transactionDate: new Date('2026-08-21'),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      {
        id: 'r2',
        payeeId: null,
        amountIls: 258,
        transactionDate: new Date('2026-08-22'),
        moneytorId: 'MT_X',
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(0);
    expect(result.candidates).toBe(0);
    expect(prisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('excludes already soft-deleted rows from candidates and merges', async () => {
    const rows: Row[] = [
      {
        id: 'pending',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date('2026-08-01'),
        moneytorId: null,
        categoryId: null,
        mergedFromId: null,
        isDeleted: false,
      },
      // Already merged away in an earlier sweep — must not be resurrected
      // as a merge candidate even though it would otherwise match.
      {
        id: 'already-deleted-twin',
        payeeId: 'p1',
        amountIls: 100,
        transactionDate: new Date('2026-08-02'),
        moneytorId: 'MT_OLD',
        categoryId: null,
        mergedFromId: null,
        isDeleted: true,
      },
    ];
    wire(rows);

    const result = await dedupeMoneytorTwinsForHousehold(HH);
    expect(result.merged).toBe(0);
    expect(result.candidates).toBe(0);
    expect(prisma.budgetTransaction.update).not.toHaveBeenCalled();
  });
});
