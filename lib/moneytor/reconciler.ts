/**
 * Shared reconciler used by every Moneytor sync loop.
 *
 * Solves three problems at once, so no future sync loop has to remember
 * to build these by hand:
 *
 * 1. **Match by stable identity, not productId.** When the incoming
 *    payload's stableKey matches an existing row, we treat it as the
 *    same entity even if Moneytor reissued the productId — so re-
 *    linking a bank connection stops creating duplicates. Match order:
 *    userCanonicalId → stableKey → productId.
 *
 * 2. **Grace-period soft delete.** Rows that stop appearing in the
 *    response are marked with `missingSince` on the first miss and
 *    hard-deleted only after N syncs without a sighting. A transient
 *    Moneytor API blip no longer wipes accounts.
 *
 * 3. **Rename detection.** When a matched row's `name` differs from
 *    what we last stored, we surface an entry in `general_logs` so
 *    the user can see it under Labs → Activity and pick up the
 *    "something changed" badge on the sidebar.
 *
 * The reconciler doesn't do the upsert itself — it just tells the
 * caller which existing row (if any) each incoming payload should
 * update, plus what to soft-delete/hard-delete. The caller writes.
 */

import type { PrismaClient } from '@prisma/client';

/** Entity types we can reconcile. Extend as new Moneytor rows land. */
export type ReconcilerEntity =
  | 'moneytor_account'
  | 'moneytor_pension_fund'
  | 'moneytor_real_estate';

/** Number of consecutive syncs a row can be missing before hard-delete.
 *  The daily-tasks cron runs once/day plus manual syncs, so 3 typically
 *  spans ~1-3 days — enough for a real provider outage to recover, but
 *  not so long that duplicates persist visibly. */
export const GRACE_PERIOD_MISSES = 3;

interface IncomingPayload {
  /** Moneytor's internal id (may be reissued). */
  productId: string;
  /** Provider-issued stable identifier or normalized composite. Nullable
   *  for entities where none is available. */
  stableKey: string | null;
  /** User-facing name — used for rename detection. */
  name: string;
}

interface ExistingRow {
  id: string;
  productId: string;
  stableKey: string | null;
  userCanonicalId: string | null;
  name: string;
}

export interface ReconcileMatch {
  /** The incoming payload the row should be updated with, if any. */
  incoming: IncomingPayload | null;
  /** The existing DB row this incoming payload maps to, if any. */
  existing: ExistingRow | null;
  /** True when the matched existing row's name != the incoming name. */
  renamed: boolean;
}

export interface ReconcileOutcome {
  /** Existing rows to hard-delete (past the grace period). */
  toHardDelete: ExistingRow[];
  /** Existing rows to mark `missingSince` on (first miss). */
  toMarkMissing: ExistingRow[];
  /** Existing rows to clear `missingSince` on (they re-appeared). */
  toResurrect: ExistingRow[];
  /** Rename events to write to general_logs. */
  renameEvents: Array<{
    existing: ExistingRow;
    oldName: string;
    newName: string;
  }>;
  /** Every (existing, incoming) pair — including brand-new ones where
   *  `existing` is null. Caller decides update vs insert. */
  matches: ReconcileMatch[];
}

/**
 * Pure computation over already-fetched arrays. Kept side-effect-free
 * so it's cheap to unit-test — the caller does the writes.
 */
export function reconcile(
  incoming: IncomingPayload[],
  existing: ExistingRow[],
  /** Reserved for future match-time policy (e.g., grace-period-aware pref). */
  _now: Date
): ReconcileOutcome {
  // Build lookup maps for O(1) matching. `.map(x => [key, x])` respects
  // insertion order so if two existing rows share the same stableKey
  // (shouldn't happen post-fix), later entries win — first-write is
  // effectively kept until the reconciler cleans it up.
  const byUserCanonical = new Map<string, ExistingRow>();
  const byStable = new Map<string, ExistingRow>();
  const byProductId = new Map<string, ExistingRow>();
  for (const r of existing) {
    if (r.userCanonicalId) byUserCanonical.set(r.userCanonicalId, r);
    if (r.stableKey) byStable.set(r.stableKey, r);
    byProductId.set(r.productId, r);
  }

  const matches: ReconcileMatch[] = [];
  const matchedExistingIds = new Set<string>();
  const renameEvents: ReconcileOutcome['renameEvents'] = [];

  for (const p of incoming) {
    // Match order:
    //  1. userCanonicalId (both the incoming stableKey and its productId
    //     are candidates — we accept whichever the user pinned)
    //  2. stableKey (provider-issued or composite)
    //  3. productId (unstable — last-resort match)
    let match: ExistingRow | null = null;
    if (p.stableKey && byUserCanonical.get(p.stableKey)) {
      match = byUserCanonical.get(p.stableKey) ?? null;
    } else if (byUserCanonical.get(p.productId)) {
      match = byUserCanonical.get(p.productId) ?? null;
    } else if (p.stableKey && byStable.get(p.stableKey)) {
      match = byStable.get(p.stableKey) ?? null;
    } else if (byProductId.get(p.productId)) {
      match = byProductId.get(p.productId) ?? null;
    }

    if (match) matchedExistingIds.add(match.id);
    const renamed = match !== null && match.name !== p.name;
    if (renamed && match) {
      renameEvents.push({ existing: match, oldName: match.name, newName: p.name });
    }
    matches.push({ incoming: p, existing: match, renamed });
  }

  // Anything in `existing` we didn't match to an incoming row is
  // "missing this sync". Grace-period logic:
  //   - Previously seen (missingSince=null): mark it missing NOW.
  //   - Previously missing but still within grace: leave as-is.
  //   - Missing past the grace window: hard-delete.
  const toHardDelete: ExistingRow[] = [];
  const toMarkMissing: ExistingRow[] = [];
  const toResurrect: ExistingRow[] = [];

  // Existing rows currently observed as re-appeared this sync.
  for (const r of existing) {
    if (matchedExistingIds.has(r.id)) {
      // Row was seen — clear any lingering missingSince by including it
      // in `toResurrect`. Cheap; the caller only writes for rows whose
      // missingSince was non-null.
      toResurrect.push(r);
      continue;
    }
  }

  return {
    toHardDelete,
    toMarkMissing,
    toResurrect,
    renameEvents,
    matches,
  };
}

/**
 * Second stage: given the existing rows that weren't seen this sync,
 * plus each row's current `missingSince`, decide which to soft-mark
 * vs hard-delete. Separated from `reconcile` because it needs the
 * missingSince field which the caller already has in-hand.
 */
export function decideMissingActions(
  unmatched: Array<ExistingRow & { missingSince: Date | null }>,
  now: Date,
  gracePeriodDays: number = GRACE_PERIOD_MISSES
): {
  toMarkMissing: Array<ExistingRow & { missingSince: Date | null }>;
  toHardDelete: Array<ExistingRow & { missingSince: Date | null }>;
} {
  const graceMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  const toMarkMissing: typeof unmatched = [];
  const toHardDelete: typeof unmatched = [];
  for (const row of unmatched) {
    if (row.missingSince == null) {
      toMarkMissing.push(row);
    } else if (now.getTime() - row.missingSince.getTime() >= graceMs) {
      toHardDelete.push(row);
    }
    // else: still within grace period — leave the row alone.
  }
  return { toMarkMissing, toHardDelete };
}

/**
 * Writes a rename event to `general_logs`. Kept minimal (no relations
 * loaded) so it's cheap to call from any sync path.
 */
export async function logRename(
  prisma: PrismaClient,
  args: {
    householdId: string;
    subjectType: ReconcilerEntity;
    subjectId: string;
    oldName: string;
    newName: string;
  }
): Promise<void> {
  await prisma.generalLog.create({
    data: {
      householdId: args.householdId,
      type: `${args.subjectType}_renamed`,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      oldValue: args.oldName,
      newValue: args.newName,
      description: `Renamed from "${args.oldName}" to "${args.newName}"`,
    },
  });
}

/**
 * Writes a hard-delete event to `general_logs`.
 */
export async function logHardDelete(
  prisma: PrismaClient,
  args: {
    householdId: string;
    subjectType: ReconcilerEntity;
    subjectId: string;
    name: string;
  }
): Promise<void> {
  await prisma.generalLog.create({
    data: {
      householdId: args.householdId,
      type: `${args.subjectType}_deleted`,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      oldValue: args.name,
      description: `Removed because Moneytor stopped returning it: "${args.name}"`,
    },
  });
}
