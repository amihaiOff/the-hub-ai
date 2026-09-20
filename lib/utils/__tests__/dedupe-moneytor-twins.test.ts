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
  // Rule-3 (cross-currency) fields. Optional so the 16 pre-existing,
  // same-currency test bodies don't need to change — they default to a
  // plain ILS row via the findMany mapping below.
  currency?: string;
  amountOriginal?: number;
};

function makeMockPrisma(rows: Row[]) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const budgetTransaction = {
    async findMany({ where }: { where: { source: string; isDeleted: boolean } }) {
      return rows
        .filter((r) => !r.isDeleted && where.source === 'moneytor_sync')
        .map((r) => ({
          ...r,
          currency: r.currency ?? 'ILS',
          amountOriginal: r.amountOriginal ?? r.amountIls,
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

jest.mock('@/lib/api/exchange-rates', () => ({
  fetchRateToILS: jest.fn(),
}));

// Wire the mocks per-test via require, so each test resets state.
import { prisma } from '@/lib/db';
import { fetchRateToILS } from '@/lib/api/exchange-rates';

describe('dedupeMoneytorTwinsForHousehold', () => {
  const HH = 'hh_test';

  beforeEach(() => {
    (prisma.budgetTransaction.findMany as jest.Mock).mockReset();
    (prisma.budgetTransaction.update as jest.Mock).mockReset();
    (prisma.$transaction as jest.Mock).mockReset();
    (fetchRateToILS as jest.Mock).mockReset();
    // Realistic default so rule-3 tests don't each need to stub it unless
    // they're specifically exercising a different rate or a failed lookup.
    (fetchRateToILS as jest.Mock).mockResolvedValue(3.7);
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

  // --- Rule 3: cross-currency pairs ----------------------------------------

  describe('rule 3 (cross-currency pairs)', () => {
    it('merges a foreign pending row with a same-payee ILS settled row within the FX margin', async () => {
      // amountIls deliberately differs between the two rows (and is unique
      // within the group) so rules 1/2 — which group by exact amountIls —
      // never see this as a candidate pair; only rule 3's payee-only
      // grouping should find it. 100 USD * 3.7 (default mocked rate) = 370,
      // an exact match against the settled row's amountIls.
      const rows: Row[] = [
        {
          id: 'pending-usd',
          payeeId: 'p1',
          amountIls: 375,
          amountOriginal: 100,
          currency: 'USD',
          transactionDate: new Date('2026-08-01'),
          moneytorId: 'MT_FX_A',
          categoryId: 'cat_travel',
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-ils',
          payeeId: 'p1',
          amountIls: 370,
          currency: 'ILS',
          transactionDate: new Date('2026-08-03'),
          moneytorId: 'MT_FX_B',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
      ];
      const state = wire(rows);

      const result = await dedupeMoneytorTwinsForHousehold(HH);
      expect(result.merged).toBe(1);

      // Later row (settled-ils) soft-deleted; no moneytorId movement since
      // both sides already carry real ids.
      const twinUpdate = state.updates.find((u) => u.id === 'settled-ils');
      expect(twinUpdate?.data).toEqual({ isDeleted: true });

      // Earlier row (pending-usd) survives, keeps its own category (already
      // set) and its own moneytorId (unchanged — no adoption needed since it
      // already had one), records mergedFromId.
      const survivorUpdate = state.updates.find((u) => u.id === 'pending-usd');
      expect(survivorUpdate?.data).toEqual({
        moneytorId: 'MT_FX_A',
        categoryId: 'cat_travel',
        mergedFromId: 'settled-ils',
      });
    });

    it('does not merge when the converted amount is outside the FX margin', async () => {
      const rows: Row[] = [
        {
          id: 'pending-usd',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 100,
          currency: 'USD',
          transactionDate: new Date('2026-08-01'),
          moneytorId: 'MT_FX_A',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-ils',
          payeeId: 'p1',
          // 100 USD * 3.7 = 370; gap against 500 is 26%, well outside the
          // 7% FX_MARGIN.
          amountIls: 500,
          currency: 'ILS',
          transactionDate: new Date('2026-08-02'),
          moneytorId: 'MT_FX_B',
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

    it('picks the closest-gap ILS candidate over the earliest-in-window one', async () => {
      // Both candidates are within the 4-day widened window and within the
      // 7% margin, but ilsFurther (earlier in time) has a bigger gap than
      // ilsCloser (later in time). A naive first-match implementation would
      // pick ilsFurther; the tie-break requires ilsCloser to win instead.
      const start = new Date('2026-08-01').getTime();
      const rows: Row[] = [
        {
          id: 'pending-usd',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 100, // converts to 370 at the default 3.7 rate
          currency: 'USD',
          transactionDate: new Date(start),
          moneytorId: 'MT_FX_A',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'ils-further',
          payeeId: 'p1',
          amountIls: 350, // gap = |370-350|/350 = 5.71%
          currency: 'ILS',
          transactionDate: new Date(start + 1 * DAY_MS),
          moneytorId: 'MT_FX_B',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'ils-closer',
          payeeId: 'p1',
          amountIls: 365, // gap = |370-365|/365 = 1.37%
          currency: 'ILS',
          transactionDate: new Date(start + 3 * DAY_MS),
          moneytorId: 'MT_FX_C',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
      ];
      const state = wire(rows);

      const result = await dedupeMoneytorTwinsForHousehold(HH);
      expect(result.merged).toBe(1);

      // ils-further must be left completely untouched.
      expect(state.updates.some((u) => u.id === 'ils-further')).toBe(false);
      expect(rows.find((r) => r.id === 'ils-further')?.isDeleted).toBe(false);

      // ils-closer is the twin, soft-deleted; pending-usd survives (earlier
      // date than ils-closer) and records the merge.
      const twinUpdate = state.updates.find((u) => u.id === 'ils-closer');
      expect(twinUpdate?.data).toEqual({ isDeleted: true });
      const survivorUpdate = state.updates.find((u) => u.id === 'pending-usd');
      expect(survivorUpdate?.data).toEqual({
        moneytorId: 'MT_FX_A',
        categoryId: null,
        mergedFromId: 'ils-closer',
      });
    });

    it('does not merge when the exchange rate lookup fails', async () => {
      (fetchRateToILS as jest.Mock).mockResolvedValue(null);

      const rows: Row[] = [
        {
          id: 'pending-usd',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 100,
          currency: 'USD',
          transactionDate: new Date('2026-08-01'),
          moneytorId: 'MT_FX_A',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-ils',
          // Would be an exact-match candidate if the rate lookup succeeded
          // — proves the null-rate short-circuit is what prevents the merge.
          amountIls: 370,
          payeeId: 'p1',
          currency: 'ILS',
          transactionDate: new Date('2026-08-02'),
          moneytorId: 'MT_FX_B',
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

    it('excludes rows already merged by rule 1/2 from rule-3 consideration', async () => {
      const start = new Date('2026-08-01').getTime();
      const rows: Row[] = [
        // Rule-1 pair: null-moneytorId pending + settled, same amountIls,
        // 2 days apart — merges under rule 1 before rule 3 ever runs.
        {
          id: 'pending-null',
          payeeId: 'p1',
          amountIls: 200,
          currency: 'ILS',
          transactionDate: new Date(start),
          moneytorId: null,
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-real',
          payeeId: 'p1',
          amountIls: 200,
          currency: 'ILS',
          transactionDate: new Date(start + 2 * DAY_MS),
          moneytorId: 'MT_X',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        // Foreign row that would otherwise match settled-real by FX
        // conversion (100 USD * 3.7 = 370... use an amountOriginal that
        // converts close to 200 instead, to target settled-real directly).
        {
          id: 'foreign',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 54.05, // * 3.7 ≈ 200, within margin of settled-real's 200
          currency: 'USD',
          transactionDate: new Date(start + 3 * DAY_MS),
          moneytorId: 'MT_FX',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
      ];
      const state = wire(rows);

      const result = await dedupeMoneytorTwinsForHousehold(HH);

      // Only the rule-1 pair merges; settled-real is no longer available as
      // an ILS candidate for rule 3 once consumed, so the foreign row is
      // left completely alone (no double-merge).
      expect(result.merged).toBe(1);
      expect(state.updates.some((u) => u.id === 'foreign')).toBe(false);
      expect(rows.find((r) => r.id === 'foreign')?.isDeleted).toBe(false);
    });

    it('matches currency case-insensitively (lowercase currency codes still merge)', async () => {
      const rows: Row[] = [
        {
          id: 'pending-usd-lower',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 100,
          currency: 'usd',
          transactionDate: new Date('2026-08-01'),
          moneytorId: 'MT_FX_A',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-ils-lower',
          payeeId: 'p1',
          amountIls: 370,
          currency: 'ils',
          transactionDate: new Date('2026-08-02'),
          moneytorId: 'MT_FX_B',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
      ];
      wire(rows);

      const result = await dedupeMoneytorTwinsForHousehold(HH);
      expect(result.merged).toBe(1);
      expect(fetchRateToILS).toHaveBeenCalledWith('USD');
    });

    it('adopts the twin real moneytorId onto a survivor that has none of its own', async () => {
      // pending-usd has no moneytorId (reachable via the force-resync unlink
      // path) and is the earlier — surviving — row. Without adoption it
      // would permanently lose its id and a future sync could re-import
      // settled-ils's underlying moneytor_transaction as a fresh duplicate.
      const rows: Row[] = [
        {
          id: 'pending-usd',
          payeeId: 'p1',
          amountIls: 999,
          amountOriginal: 100,
          currency: 'USD',
          transactionDate: new Date('2026-08-01'),
          moneytorId: null,
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
        {
          id: 'settled-ils',
          payeeId: 'p1',
          amountIls: 370,
          currency: 'ILS',
          transactionDate: new Date('2026-08-02'),
          moneytorId: 'MT_FX_B',
          categoryId: null,
          mergedFromId: null,
          isDeleted: false,
        },
      ];
      const state = wire(rows);

      const result = await dedupeMoneytorTwinsForHousehold(HH);
      expect(result.merged).toBe(1);

      // Twin's id is cleared before it's soft-deleted (avoids the unique
      // constraint when the survivor adopts it).
      const twinUpdate = state.updates.find((u) => u.id === 'settled-ils');
      expect(twinUpdate?.data).toEqual({ moneytorId: null, isDeleted: true });

      // Survivor adopts the twin's real id instead of staying null.
      const survivorUpdate = state.updates.find((u) => u.id === 'pending-usd');
      expect(survivorUpdate?.data).toEqual({
        moneytorId: 'MT_FX_B',
        categoryId: null,
        mergedFromId: 'settled-ils',
      });
    });
  });
});
