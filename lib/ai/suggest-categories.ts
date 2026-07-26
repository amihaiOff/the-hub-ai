import { prisma } from '@/lib/db';
import { categorizeTransaction, type CategoryOption } from '@/lib/ai/categorize-transaction';

// Below this confidence we log the attempt but do NOT attach a suggestion.
export const CONFIDENCE_THRESHOLD = 0.6;
// How many transactions to process in one batch (bounds cost and wall-clock).
export const DEFAULT_BATCH_LIMIT = 8;
export const MAX_BATCH_LIMIT = 25;
export const SUGGEST_CONCURRENCY = 3;
// Auto-retry after a categorization error is now off (one attempt per row via
// the atomic claim below). Kept as an export at 1 so pre-existing callers
// still type-check; the value is no longer consulted in the runtime path.
export const MAX_CATEGORIZATION_ERRORS = 1;

export interface SuggestCounts {
  processed: number;
  suggested: number;
  lowConfidence: number;
  noMatch: number;
  errors: number;
}

/** Everything a household needs before it can run a suggestion batch. */
export interface PreparedHousehold {
  apiKey: string;
  categories: CategoryOption[];
  nameById: Map<string, string>;
}

export type PrepareResult =
  | { ok: true; prepared: PreparedHousehold }
  | { ok: false; reason: 'no_api_key' | 'no_categories' };

export interface RunBatchOptions {
  /** Max transactions to process in this batch (capped at MAX_BATCH_LIMIT). */
  limit?: number;
  /** Restrict to specific transaction ids (used by the manual button). */
  transactionIds?: string[];
  /**
   * When true, only pick transactions the AI has never attempted before
   * (categorizationAttemptedAt IS NULL). The automatic ingestion pass and the
   * cron drain use this so each transaction is auto-attempted exactly once;
   * the manual "Suggest" button leaves it false so the user can re-run.
   */
  onlyUnattempted?: boolean;
  /**
   * Absolute wall-clock cutoff (Date.now() ms). Once reached, no further model
   * calls are started in this batch — the remaining rows stay unattempted for a
   * later run. Guards the serverless timeout in the cron and post-import passes.
   */
  deadlineMs?: number;
}

export type SuggestResult =
  | { ok: true; counts: SuggestCounts }
  | { ok: false; reason: 'no_api_key' | 'no_categories' };

/**
 * Row shape returned by the atomic-claim UPDATE. Matches the fields consumed
 * by the worker below. Payee name is joined in from `budget_payees`.
 */
interface ClaimedRow {
  id: string;
  amountIls: number;
  notes: string | null;
  categorizationErrorCount: number;
  payeeName: string | null;
}

/**
 * Atomically claim up to `limit` categorization candidates by stamping
 * `categorization_attempted_at = NOW()` on them in a single UPDATE. Postgres
 * `FOR UPDATE SKIP LOCKED` inside the sub-query guarantees two concurrent
 * callers never grab the same rows. Returns the claimed rows (with the
 * payee name already joined) for the caller to categorize.
 */
async function claimTransactionsForBatch(args: {
  householdId: string;
  limit: number;
  onlyUnattempted: boolean;
  transactionIds?: string[];
}): Promise<ClaimedRow[]> {
  const { householdId, limit, onlyUnattempted, transactionIds } = args;
  const attemptedFilter = onlyUnattempted ? 'AND t.categorization_attempted_at IS NULL' : '';
  const idsFilter = transactionIds && transactionIds.length > 0 ? 'AND t.id = ANY($2::text[])' : '';

  // The Prisma model uses `tags: { none: {} }` in the old query — filter the
  // same way here so we don't step on transactions the user tagged manually
  // (a signal they've curated the row themselves).
  const sql = `
    WITH claimed AS (
      UPDATE budget_transactions t
      SET categorization_attempted_at = NOW()
      WHERE t.id IN (
        SELECT id FROM budget_transactions t2
        WHERE t2.household_id = $1
          AND t2.is_deleted = false
          AND t2.type = 'expense'
          AND t2.category_id IS NULL
          AND t2.suggested_category_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM budget_transaction_tags bt WHERE bt.transaction_id = t2.id
          )
          ${attemptedFilter.replace(/t\./g, 't2.')}
          ${idsFilter.replace(/t\./g, 't2.')}
        ORDER BY t2.transaction_date DESC
        LIMIT ${transactionIds && transactionIds.length > 0 ? '$3' : '$2'}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING t.id, t.amount_ils, t.notes, t.categorization_error_count, t.payee_id
    )
    SELECT c.id, c.amount_ils AS "amountIls", c.notes,
           c.categorization_error_count AS "categorizationErrorCount",
           p.name AS "payeeName"
    FROM claimed c
    LEFT JOIN budget_payees p ON p.id = c.payee_id`;

  const params: unknown[] =
    transactionIds && transactionIds.length > 0
      ? [householdId, transactionIds, limit]
      : [householdId, limit];

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      amountIls: unknown;
      notes: string | null;
      categorizationErrorCount: number;
      payeeName: string | null;
    }>
  >(sql, ...params);
  return rows.map((r) => ({
    id: r.id,
    amountIls: Number(r.amountIls),
    notes: r.notes,
    categorizationErrorCount: r.categorizationErrorCount,
    payeeName: r.payeeName,
  }));
}

/** Run `worker` over `items` with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/**
 * Load the API key and category list a household needs to categorize.
 * Returns a typed failure (rather than throwing) for the two "expected"
 * misconfigurations so callers can map them to a 400 or silently skip.
 */
export async function prepareHousehold(householdId: string): Promise<PrepareResult> {
  // Resolve the API key: household setting first, env var as a fallback.
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { anthropicApiKey: true },
  });
  const apiKey = household?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' };
  }

  const categoryRows = await prisma.budgetCategory.findMany({
    where: { householdId },
    select: { id: true, name: true, group: { select: { name: true } } },
  });
  if (categoryRows.length === 0) {
    return { ok: false, reason: 'no_categories' };
  }

  const categories: CategoryOption[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group.name,
  }));
  const nameById = new Map(categoryRows.map((c) => [c.id, c.name]));

  return { ok: true, prepared: { apiKey, categories, nameById } };
}

/**
 * Run one batch of AI categorization for a household. Uses an atomic UPDATE
 * to claim rows (stamping `categorization_attempted_at` immediately) so
 * concurrent workers can never process the same transaction twice. For each
 * claimed row:
 *   - suggested:       attach suggestedCategoryId + confidence + timestamp;
 *   - low_confidence:  log only, leave the transaction uncategorized;
 *   - no_match:        log only, leave the transaction uncategorized;
 *   - error:           log + bump categorizationErrorCount.
 * Errors do NOT retry the row automatically — the stamp stays put. Users can
 * manually re-attempt via the Suggest button with `force: true`, which resets
 * the stamp on the target rows before claiming.
 */
export async function runSuggestionBatch(
  householdId: string,
  prepared: PreparedHousehold,
  options: RunBatchOptions = {}
): Promise<SuggestCounts> {
  const { apiKey, categories, nameById } = prepared;
  const limit = Math.min(options.limit ?? DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT);

  // Atomic claim: stamp `categorization_attempted_at` on the batch's rows in
  // a single `UPDATE ... FROM (... FOR UPDATE SKIP LOCKED) RETURNING ...`.
  // Concurrent workers can't observe the same row twice — Postgres locks the
  // selected rows for the duration of the sub-query so any parallel claim
  // sees them as already-taken and skips them. This eliminates the retry
  // storm we saw in prod where up to 15 workers all categorized the same
  // transaction because the old SELECT → LLM → UPDATE flow left a several-
  // second window during which the row appeared un-attempted.
  const transactions = await claimTransactionsForBatch({
    householdId,
    limit,
    onlyUnattempted: options.onlyUnattempted ?? false,
    transactionIds: options.transactionIds,
  });

  const counts: SuggestCounts = {
    processed: 0,
    suggested: 0,
    lowConfidence: 0,
    noMatch: 0,
    errors: 0,
  };

  await mapPool(transactions, SUGGEST_CONCURRENCY, async (tx) => {
    // Respect the wall-clock cutoff: leave the remaining rows for a later run
    // rather than risk overrunning the serverless timeout mid-write.
    if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs) return;
    const name = tx.payeeName || tx.notes || 'Unknown transaction';
    counts.processed++;
    try {
      const result = await categorizeTransaction(apiKey, {
        name,
        amountIls: tx.amountIls,
        notes: tx.notes,
        categories,
      });

      const chosenName = result.categoryId ? (nameById.get(result.categoryId) ?? null) : null;
      let status: 'suggested' | 'low_confidence' | 'no_match';

      // `categorization_attempted_at` was already stamped by the atomic claim
      // above; here we only add the suggestion payload when confidence clears
      // the bar. No-match / low-confidence rows need no follow-up write.
      if (!result.categoryId) {
        status = 'no_match';
        counts.noMatch++;
      } else if (result.confidence < CONFIDENCE_THRESHOLD) {
        status = 'low_confidence';
        counts.lowConfidence++;
      } else {
        status = 'suggested';
        counts.suggested++;
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: {
            suggestedCategoryId: result.categoryId,
            suggestionConfidence: result.confidence,
            suggestedAt: new Date(),
          },
        });
      }

      await prisma.budgetCategorizationLog.create({
        data: {
          householdId,
          transactionId: tx.id,
          transactionName: name,
          status,
          resultCategoryId: result.categoryId,
          resultCategoryName: chosenName,
          confidence: result.confidence,
          reasoning: result.reasoning || null,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheCreationTokens: result.usage.cacheCreationTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          webSearches: result.usage.webSearches,
        },
      });
    } catch (err) {
      counts.errors++;
      // The row's `categorization_attempted_at` stays stamped from the atomic
      // claim — one auto-attempt per row, period. This is intentional: the
      // prior "clear stamp on error, retry up to N times" behaviour is what
      // turned a bad-key event into a $19 storm in prod. The user can
      // manually re-attempt via the Suggest button (force=true) if desired.
      // We still bump `categorization_error_count` for visibility.
      const nextErrorCount = (tx.categorizationErrorCount ?? 0) + 1;
      try {
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: { categorizationErrorCount: nextErrorCount },
        });
      } catch (updateErr) {
        console.error('Failed to record categorization error count:', updateErr);
      }
      // Never let a logging failure escape the worker — one bad write must not
      // reject Promise.all and drop the partial counts / already-written
      // suggestions from the rest of the batch.
      try {
        await prisma.budgetCategorizationLog.create({
          data: {
            householdId,
            transactionId: tx.id,
            transactionName: name,
            status: 'error',
            reasoning: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
          },
        });
      } catch (logErr) {
        console.error('Failed to write categorization error log:', logErr);
      }
    }
  });

  return counts;
}

/**
 * Convenience wrapper: prepare a household and run a single suggestion batch.
 * Used by the manual "Suggest" endpoint and the post-import background pass.
 */
export async function suggestCategoriesForHousehold(
  householdId: string,
  options: RunBatchOptions = {}
): Promise<SuggestResult> {
  const prep = await prepareHousehold(householdId);
  if (!prep.ok) {
    return prep;
  }
  const counts = await runSuggestionBatch(householdId, prep.prepared, options);
  return { ok: true, counts };
}
