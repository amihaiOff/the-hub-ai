import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronLog } from '@/lib/utils/cron-logger';
import { prepareHousehold, runSuggestionBatch, MAX_BATCH_LIMIT } from '@/lib/ai/suggest-categories';

// AI categorization with web search takes a few seconds per transaction.
export const maxDuration = 60;

// Stop starting new work with headroom to spare under maxDuration so the run
// always returns cleanly (and logs its results) instead of being killed. The
// same cutoff is handed to each batch so it won't start a model call past it.
const DEADLINE_MS = 50_000;
// Per household per run — bounds cost/wall-clock even if batches keep coming
// back full.
const MAX_BATCHES_PER_HOUSEHOLD = 4;
// Batch size per run; also the "drained" threshold (a short batch => no more
// candidates). Kept as one local so the two never drift apart.
const BATCH_LIMIT = MAX_BATCH_LIMIT;

/**
 * GET /api/cron/suggest-categories
 *
 * Drains uncategorized expense transactions the AI has never attempted
 * (categorizationAttemptedAt IS NULL) across every household, in bounded
 * batches within a wall-clock budget. This is the durable half of automatic
 * ingestion categorization: the post-import `after()` pass gives instant
 * suggestions for typical imports, and this cron mops up large imports over
 * the following runs without ever risking a request timeout.
 *
 * Protected by CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return withCronLog('/api/cron/suggest-categories', async () => {
    const deadline = Date.now() + DEADLINE_MS;
    const results = {
      householdsProcessed: 0,
      processed: 0,
      suggested: 0,
      lowConfidence: 0,
      noMatch: 0,
      errors: 0,
      timedOut: false,
      skipped: [] as Array<{ householdId: string; reason: string }>,
    };

    const households = await prisma.household.findMany({ select: { id: true } });

    for (const { id: householdId } of households) {
      if (Date.now() >= deadline) {
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

      for (let batch = 0; batch < MAX_BATCHES_PER_HOUSEHOLD; batch++) {
        if (Date.now() >= deadline) {
          results.timedOut = true;
          break;
        }
        const counts = await runSuggestionBatch(householdId, prep.prepared, {
          limit: BATCH_LIMIT,
          onlyUnattempted: true,
          deadlineMs: deadline,
        });
        results.processed += counts.processed;
        results.suggested += counts.suggested;
        results.lowConfidence += counts.lowConfidence;
        results.noMatch += counts.noMatch;
        results.errors += counts.errors;

        // Fewer candidates than the batch limit means this household is drained.
        if (counts.processed < BATCH_LIMIT) break;

        // A full batch that produced only errors (no suggestion/no-match/low)
        // means the model is failing for this household right now (e.g. a bad
        // key). Stop hammering it this run — the bounded retry counter will let
        // the rows be re-tried on a later run, then give up.
        const progress = counts.suggested + counts.lowConfidence + counts.noMatch;
        if (progress === 0) break;
      }
    }

    return {
      body: {
        success: true,
        message: 'Automatic categorization drain completed',
        results,
        timestamp: new Date().toISOString(),
      },
    };
  });
}
