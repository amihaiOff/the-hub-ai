import { prisma } from '@/lib/db';

/**
 * Pending→settled twin merge policy.
 *
 * When Moneytor's pending row appeared under one id and later settled under
 * a different id + date, we imported both and ended up with a pair in
 * budget_transactions. Moneytor now reissues the settled row using the
 * pending's date, but historical pairs (and any that slip through the
 * date-alignment) still need collapsing.
 *
 * Merge rule (kept conservative to avoid collapsing legitimate same-amount
 * recurring buys like a daily bus fare):
 *   - Same householdId, payeeId, amountIls
 *   - source = 'moneytor_sync' on both rows
 *   - transactionDate within ±TWIN_WINDOW_DAYS
 *   - The candidate "pending" row must have moneytorId = NULL (its id was
 *     dropped when Moneytor's side deleted the pending). Recurring rows
 *     each carry their own moneytorId and are therefore skipped.
 *   - Neither row is already soft-deleted.
 *
 * On merge: keep the EARLIER row as the survivor (its date is the pending
 * date the user knows, and it often carries the user's category); back-stamp
 * the later row's moneytorId onto the survivor, prefer any non-null category
 * from either side, soft-delete the later row, and set survivor.mergedFromId
 * to point at the soft-deleted twin for auditability.
 */
export const TWIN_WINDOW_DAYS = 7;
const TWIN_WINDOW_MS = TWIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface MergeSummary {
  merged: number;
  candidates: number;
}

/**
 * Sweep a household's budget_transactions for pending→settled twin pairs and
 * merge them per the policy above. Idempotent — a second run against a
 * cleaned household is a no-op.
 */
export async function dedupeMoneytorTwinsForHousehold(householdId: string): Promise<MergeSummary> {
  // Pull only Moneytor-sourced, non-deleted rows with a payee. We build the
  // candidate index off (payeeId, amountIls) and scan for pairs.
  const rows = await prisma.budgetTransaction.findMany({
    where: {
      householdId,
      source: 'moneytor_sync',
      isDeleted: false,
      payeeId: { not: null },
    },
    select: {
      id: true,
      payeeId: true,
      amountIls: true,
      transactionDate: true,
      moneytorId: true,
      categoryId: true,
      mergedFromId: true,
    },
  });

  // Group by (payeeId|amount). Within each group, look for a (nullMoneytor,
  // notNullMoneytor) pair within the window. When found, merge.
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.payeeId) continue;
    const key = `${r.payeeId}|${Number(r.amountIls).toFixed(2)}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  let merged = 0;
  let candidates = 0;

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    candidates += group.length;

    // Track already-consumed ids so a single row can't be merged twice in
    // this sweep — otherwise a longer chain (3+ rows within window) could
    // produce cascading merges of unrelated rows.
    const consumed = new Set<string>();

    // Iterate; for each null-moneytorId row (candidate pending survivor),
    // find its earliest non-null-moneytorId partner within window.
    const pendings = group
      .filter((r) => r.moneytorId === null)
      .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
    const settleds = group
      .filter((r) => r.moneytorId !== null)
      .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());

    for (const pending of pendings) {
      if (consumed.has(pending.id)) continue;
      const partner = settleds.find(
        (s) =>
          !consumed.has(s.id) &&
          Math.abs(s.transactionDate.getTime() - pending.transactionDate.getTime()) <=
            TWIN_WINDOW_MS
      );
      if (!partner) continue;

      // Survivor = whichever of the two has the earlier date (usually the
      // pending, but stay date-driven so we always keep the user-visible
      // date the pending established).
      const [survivor, twin] =
        pending.transactionDate <= partner.transactionDate
          ? [pending, partner]
          : [partner, pending];

      // Prefer a set category over an unset one (either side may hold it).
      const winningCategoryId = survivor.categoryId ?? twin.categoryId ?? null;
      // Move the settled row's moneytorId onto the survivor (it must be
      // non-null; the null side is the survivor's own).
      const survivingMoneytorId = survivor.moneytorId ?? twin.moneytorId ?? null;

      // Move moneytorId off the twin FIRST so the unique constraint on
      // `moneytor_id` doesn't fire when we set it on the survivor. The twin's
      // original moneytorId is still recoverable via the mergedFromId link
      // plus moneytor_transactions if needed, and the survivor now owns it.
      await prisma.$transaction([
        prisma.budgetTransaction.update({
          where: { id: twin.id },
          data: { moneytorId: null, isDeleted: true },
        }),
        prisma.budgetTransaction.update({
          where: { id: survivor.id },
          data: {
            moneytorId: survivingMoneytorId,
            categoryId: winningCategoryId,
            mergedFromId: twin.id,
          },
        }),
      ]);

      consumed.add(survivor.id);
      consumed.add(twin.id);
      merged += 1;
    }
  }

  return { merged, candidates };
}
