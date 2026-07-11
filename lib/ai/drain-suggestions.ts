import { prisma } from '@/lib/db';
import { prepareHousehold, runSuggestionBatch, MAX_BATCH_LIMIT } from '@/lib/ai/suggest-categories';

// Batch size per run; also the "drained" threshold (a short batch => no more
// candidates). Kept as one local so the two never drift apart.
export const DRAIN_BATCH_LIMIT = MAX_BATCH_LIMIT;
// Per household per drain — bounds cost/wall-clock even if batches keep coming
// back full.
export const DRAIN_MAX_BATCHES_PER_HOUSEHOLD = 4;

export interface DrainResult {
  householdsProcessed: number;
  processed: number;
  suggested: number;
  lowConfidence: number;
  noMatch: number;
  errors: number;
  timedOut: boolean;
  skipped: Array<{ householdId: string; reason: string }>;
}

/**
 * Drain uncategorized expenses the AI has not attempted yet
 * (categorizationAttemptedAt IS NULL) across every household, in bounded
 * batches, stopping once `deadlineMs` (a Date.now() cutoff) is reached.
 *
 * Shared by the daily-cron backstop and the manual drain endpoint. Safe to
 * interrupt: progress is per-row (each transaction commits independently), so a
 * partial run just leaves the rest for the next drain.
 */
export async function drainSuggestions(deadlineMs: number): Promise<DrainResult> {
  const results: DrainResult = {
    householdsProcessed: 0,
    processed: 0,
    suggested: 0,
    lowConfidence: 0,
    noMatch: 0,
    errors: 0,
    timedOut: false,
    skipped: [],
  };

  const households = await prisma.household.findMany({ select: { id: true } });

  for (const { id: householdId } of households) {
    if (Date.now() >= deadlineMs) {
      results.timedOut = true;
      break;
    }

    const prep = await prepareHousehold(householdId);
    if (!prep.ok) {
      // No API key or no categories configured — nothing to drain.
      results.skipped.push({ householdId, reason: prep.reason });
      continue;
    }
    results.householdsProcessed++;

    for (let batch = 0; batch < DRAIN_MAX_BATCHES_PER_HOUSEHOLD; batch++) {
      if (Date.now() >= deadlineMs) {
        results.timedOut = true;
        break;
      }
      const counts = await runSuggestionBatch(householdId, prep.prepared, {
        limit: DRAIN_BATCH_LIMIT,
        onlyUnattempted: true,
        deadlineMs,
      });
      results.processed += counts.processed;
      results.suggested += counts.suggested;
      results.lowConfidence += counts.lowConfidence;
      results.noMatch += counts.noMatch;
      results.errors += counts.errors;

      // Fewer candidates than the batch limit means this household is drained.
      if (counts.processed < DRAIN_BATCH_LIMIT) break;

      // A full batch that made zero progress (all errors) means the model is
      // failing for this household right now (e.g. a bad key). Stop hammering
      // it this run; the bounded retry counter handles it across runs.
      const progress = counts.suggested + counts.lowConfidence + counts.noMatch;
      if (progress === 0) break;
    }
  }

  return results;
}
