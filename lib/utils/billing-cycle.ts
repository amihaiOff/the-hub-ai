/**
 * Helpers for "billing cycle" months. A household's `billingCycleStartDay`
 * (1, 2, or 10) shifts what "a month" means in the budget UI. With
 * `startDay = 10`, asking for `2026-06` means transactions from
 * `2026-06-10 00:00` (inclusive) to `2026-07-10 00:00` (exclusive).
 *
 * Convention: a `YYYY-MM` string always refers to the cycle whose START
 * day falls in that calendar month. So `2026-06` with `startDay=10` is
 * "the cycle that starts on June 10".
 */

export const VALID_BILLING_CYCLE_DAYS = [1, 2, 10] as const;
export type BillingCycleStartDay = (typeof VALID_BILLING_CYCLE_DAYS)[number];

export interface CycleRange {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
}

function parseMonth(month: string): { year: number; monthNum: number } {
  const [y, m] = month.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`Invalid month string: ${month}`);
  }
  return { year: y, monthNum: m };
}

/**
 * Returns the [from, to) range a `YYYY-MM` value covers under the given
 * cycle start day. `from` is `YYYY-MM-<startDay> 00:00:00` and `to` is the
 * same wall-clock instant one calendar month later.
 *
 * Dates are constructed in local time — matches the existing route code,
 * which uses `new Date(year, monthNum - 1, 1)`.
 */
export function monthToCycleRange(month: string, startDay: number): CycleRange {
  const { year, monthNum } = parseMonth(month);
  const safeStart = clampStartDay(startDay);
  const from = new Date(year, monthNum - 1, safeStart);
  const to = new Date(year, monthNum, safeStart);
  return { from, to };
}

/**
 * Returns the `YYYY-MM` cycle that contains `today` for the given start
 * day. If `today` is before this calendar month's start day, the active
 * cycle is the previous calendar month.
 */
export function getCurrentCycleMonth(today: Date, startDay: number): string {
  const safeStart = clampStartDay(startDay);
  let y = today.getFullYear();
  let m = today.getMonth(); // 0-indexed
  if (today.getDate() < safeStart) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function clampStartDay(startDay: number): number {
  if (!Number.isFinite(startDay)) return 1;
  // Keep within a safe range — 1..28 are valid for every month. We only
  // expose 1/2/10 in the UI, but tolerate anything in [1, 28] defensively.
  return Math.min(28, Math.max(1, Math.floor(startDay)));
}
