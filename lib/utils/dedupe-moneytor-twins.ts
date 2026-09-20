import { prisma } from '@/lib/db';
import { fetchRateToILS } from '@/lib/api/exchange-rates';
import { formatCurrencyForTransaction } from '@/lib/utils/budget';

/**
 * Pending→settled twin merge policy.
 *
 * When Moneytor's pending row appeared under one id and later settled under
 * a different id + date, we imported both and ended up with a pair in
 * budget_transactions. Moneytor now reissues the settled row using the
 * pending's date, but historical pairs (and any that slip through the
 * date-alignment) still need collapsing.
 *
 * Three matching rules, all scoped to same householdId + payeeId,
 * source = 'moneytor_sync' on both rows, neither already soft-deleted
 * (rules 1/2 also require matching amountIls; rule 3 doesn't, see below):
 *
 * 1. Null-moneytorId case (TWIN_WINDOW_DAYS): the candidate "pending" row has
 *    moneytorId = NULL (its id was dropped when Moneytor's side deleted the
 *    pending). On merge, keep the EARLIER row as survivor (its date is the
 *    pending date the user knows), back-stamp the later row's moneytorId
 *    onto it, prefer any non-null category from either side, soft-delete the
 *    later row, and set survivor.mergedFromId for auditability.
 *
 * 2. Both-sides-have-an-id case (WIDENED_TWIN_WINDOW_DAYS, narrower): some
 *    feeds hand out a real moneytorId even for the not-yet-final row, so
 *    neither side is null and rule 1 never fires — these sat as permanent
 *    visible duplicates. Same survivor pick (earlier row, its own date and
 *    moneytorId kept as-is — no id to move since both are already real),
 *    prefer non-null category from either side, soft-delete the later row,
 *    set survivor.mergedFromId. Kept to a tighter window than rule 1 because
 *    there's no null-id signal at all here to distinguish a real duplicate
 *    from a same-amount recurring purchase (coffee, parking) — same payee +
 *    same amount + a few days apart is genuinely ambiguous past a short gap.
 *
 * 3. Cross-currency case (WIDENED_TWIN_WINDOW_DAYS): a foreign charge lands
 *    once in its original currency (pending) and again in ILS (settled) —
 *    the exchange conversion means neither amountIls nor currency match, so
 *    rules 1/2 never find these. Same payee + window, then converts the
 *    foreign amount to ILS at today's rate (not the historical day-of-charge
 *    rate — a few days' drift is small next to the margin below) and accepts
 *    it as a match only within FX_MARGIN, to absorb the bank/card's own
 *    conversion markup on top of rate movement. When multiple ILS candidates
 *    are in range, the closest-converted-amount one wins — same payee +
 *    same rough price point (a coffee bought twice on a trip) is common
 *    enough that "first in window" isn't a safe enough tie-break here.
 *    A failed rate lookup or no candidate inside the margin means no merge
 *    — the safe default, since a false non-merge just leaves two rows where
 *    a false merge silently deletes a real transaction. moneytorId handling
 *    mirrors rule 2 (both sides usually already real, twin's id left intact
 *    so it still reads as already-promoted) but falls back to rule 1's
 *    adopt-and-clear behavior if the survivor happens to lack an id itself.
 *    Survivor pick (id/date/category preference) still follows the earlier
 *    row like rules 1/2, but the amount/currency always come from the ILS
 *    side regardless of which one that is — a merged transaction becomes a
 *    normal ILS row from then on, so only a charge that's still genuinely
 *    unsettled displays in its original currency. The original foreign
 *    amount isn't lost once converted, though — it's appended to the
 *    survivor's notes ("Originally $100 USD") so it stays visible even
 *    after the row switches over to ILS.
 */
export const TWIN_WINDOW_DAYS = 7;
const TWIN_WINDOW_MS = TWIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const WIDENED_TWIN_WINDOW_DAYS = 4;
const WIDENED_TWIN_WINDOW_MS = WIDENED_TWIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** Tolerance on the FX-converted amount for rule 3 (cross-currency pairs). */
export const FX_MARGIN = 0.07;

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
      currency: true,
      amountOriginal: true,
      notes: true,
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
  // Every id counted into `candidates` so far, across all three rules — a row
  // considered by rule 1/2's grouping but left unmerged (e.g. the odd one out
  // in a 3-way cluster) can also surface in rule 3's payee grouping, and
  // without this it would be tallied twice.
  const countedIds = new Set<string>();
  // Ids merged by rules 1/2 above, fed into rule 3 below so a row already
  // paired on exact amount isn't reconsidered for a looser FX-based pair.
  const globalConsumed = new Set<string>();

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    candidates += group.length;
    for (const r of group) countedIds.add(r.id);

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

    // Second pass: pairs where BOTH sides already carry a real moneytorId
    // (rule 2 above) — the loop needs its own scan since `pendings` above is
    // empty for these. No moneytorId to move: each row already owns a valid
    // one, so soft-deleting the twin as-is leaves it correctly marked
    // "already promoted" and safe from re-import on the next sync.
    const remaining = settleds
      .filter((r) => !consumed.has(r.id))
      .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());

    for (let i = 0; i < remaining.length; i++) {
      const earlier = remaining[i];
      if (consumed.has(earlier.id)) continue;
      const later = remaining
        .slice(i + 1)
        .find(
          (r) =>
            !consumed.has(r.id) &&
            r.transactionDate.getTime() - earlier.transactionDate.getTime() <=
              WIDENED_TWIN_WINDOW_MS
        );
      if (!later) continue;

      const winningCategoryId = earlier.categoryId ?? later.categoryId ?? null;

      await prisma.$transaction([
        prisma.budgetTransaction.update({
          where: { id: later.id },
          data: { isDeleted: true },
        }),
        prisma.budgetTransaction.update({
          where: { id: earlier.id },
          data: { categoryId: winningCategoryId, mergedFromId: later.id },
        }),
      ]);

      consumed.add(earlier.id);
      consumed.add(later.id);
      merged += 1;
    }

    for (const id of consumed) globalConsumed.add(id);
  }

  // Rule 3: cross-currency pairs (see policy comment above). Grouped by
  // payee only — amount can't be a grouping key here since it's exactly
  // what differs between the two currencies.
  const byPayee = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.payeeId || globalConsumed.has(r.id)) continue;
    const arr = byPayee.get(r.payeeId) ?? [];
    arr.push(r);
    byPayee.set(r.payeeId, arr);
  }

  const rateCache = new Map<string, Promise<number | null>>();
  const getRate = (currency: string) => {
    const upper = currency.toUpperCase();
    if (!rateCache.has(upper)) rateCache.set(upper, fetchRateToILS(upper));
    return rateCache.get(upper)!;
  };

  for (const group of byPayee.values()) {
    const foreignRows = group.filter((r) => r.currency.toUpperCase() !== 'ILS');
    const ilsRows = group.filter((r) => r.currency.toUpperCase() === 'ILS');
    if (foreignRows.length === 0 || ilsRows.length === 0) continue;
    for (const r of [...foreignRows, ...ilsRows]) {
      if (!countedIds.has(r.id)) {
        countedIds.add(r.id);
        candidates += 1;
      }
    }

    for (const pending of foreignRows) {
      if (globalConsumed.has(pending.id)) continue;
      const rate = await getRate(pending.currency);
      if (!rate) continue; // lookup failed — no merge is the safe default

      const convertedIls = Number(pending.amountOriginal) * rate;

      // Closest converted-amount match wins, not first-in-window — same
      // payee + same rough price point (two coffees on a trip) is common
      // enough that proximity alone isn't a safe tie-break.
      let best: (typeof ilsRows)[number] | null = null;
      let bestGap = Infinity;
      for (const settled of ilsRows) {
        if (globalConsumed.has(settled.id)) continue;
        if (
          Math.abs(settled.transactionDate.getTime() - pending.transactionDate.getTime()) >
          WIDENED_TWIN_WINDOW_MS
        )
          continue;
        const settledAmount = Number(settled.amountIls);
        if (settledAmount <= 0) continue;
        const gap = Math.abs(convertedIls - settledAmount) / settledAmount;
        if (gap <= FX_MARGIN && gap < bestGap) {
          best = settled;
          bestGap = gap;
        }
      }
      if (!best) continue;

      const [survivor, twin] =
        pending.transactionDate <= best.transactionDate ? [pending, best] : [best, pending];
      const winningCategoryId = survivor.categoryId ?? twin.categoryId ?? null;

      // Usually both sides already carry a real moneytorId (rule 3 candidates
      // come from ordinary sync, which always assigns one) and neither needs
      // touching — the twin keeps its id even while soft-deleted, same as
      // rule 2, so a later sync still sees it as already-promoted. The one
      // exception is a survivor with no id of its own (reachable only via
      // the force-resync unlink path rule 1 also handles): then the twin's
      // real id must move over, cleared from the twin FIRST so the unique
      // constraint doesn't fire — otherwise the merged transaction would
      // permanently lose its id and a future sync could re-import it.
      const needsIdAdoption = survivor.moneytorId === null && twin.moneytorId !== null;
      const survivingMoneytorId = survivor.moneytorId ?? twin.moneytorId ?? null;

      // Record what the charge originally was in its own currency, since the
      // survivor's amount/currency below get overwritten with the settled
      // ILS numbers — `pending` (not survivor/twin) is always the foreign
      // side by construction, regardless of which one is which here.
      const originalAmountNote = `Originally ${formatCurrencyForTransaction(
        Number(pending.amountOriginal),
        pending.currency
      )} ${pending.currency.toUpperCase()}`;
      const notesWithOriginal = survivor.notes
        ? `${survivor.notes}\n${originalAmountNote}`
        : originalAmountNote;

      await prisma.$transaction([
        prisma.budgetTransaction.update({
          where: { id: twin.id },
          data: needsIdAdoption ? { moneytorId: null, isDeleted: true } : { isDeleted: true },
        }),
        prisma.budgetTransaction.update({
          where: { id: survivor.id },
          data: {
            moneytorId: survivingMoneytorId,
            categoryId: winningCategoryId,
            mergedFromId: twin.id,
            // `best` is always the ILS/settled side (it comes from ilsRows,
            // regardless of which of the two ends up as survivor/twin by
            // date). Adopting its real amount/currency here is the whole
            // point of the merge — the pending row's converted estimate was
            // only ever a stand-in for finding the pair, never the number to
            // keep showing once the real charge is known.
            amountIls: best.amountIls,
            currency: best.currency,
            amountOriginal: best.amountOriginal,
            notes: notesWithOriginal,
          },
        }),
      ]);

      globalConsumed.add(pending.id);
      globalConsumed.add(best.id);
      merged += 1;
    }
  }

  return { merged, candidates };
}
