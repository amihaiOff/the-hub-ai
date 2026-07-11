import { prisma } from '@/lib/db';
import { categorizeTransaction, type CategoryOption } from '@/lib/ai/categorize-transaction';

// Below this confidence we log the attempt but do NOT attach a suggestion.
export const CONFIDENCE_THRESHOLD = 0.6;
// How many transactions to process in one batch (bounds cost and wall-clock).
export const DEFAULT_BATCH_LIMIT = 8;
export const MAX_BATCH_LIMIT = 25;
export const SUGGEST_CONCURRENCY = 3;
// After this many failed AI attempts a transaction is marked attempted so a
// persistent failure (bad key, sustained rate-limit) can't re-bill it forever.
// Genuinely transient failures still get a few retries across drains.
export const MAX_CATEGORIZATION_ERRORS = 3;

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
 * Run one batch of AI categorization for a household. For each uncategorized
 * expense without an existing suggestion, ask the model for a category and:
 *   - suggested:       attach suggestedCategoryId (+ confidence/timestamp);
 *   - low_confidence:  log only, leave the transaction uncategorized;
 *   - no_match:        log only, leave the transaction uncategorized;
 *   - error:           log + bump categorizationErrorCount.
 * Every non-error attempt stamps categorizationAttemptedAt so the automatic
 * pass never re-queries the model for the same transaction. Errors bump a
 * retry counter and stay re-queryable until it hits MAX_CATEGORIZATION_ERRORS,
 * at which point the row is stamped so a persistent failure can't re-bill it.
 */
export async function runSuggestionBatch(
  householdId: string,
  prepared: PreparedHousehold,
  options: RunBatchOptions = {}
): Promise<SuggestCounts> {
  const { apiKey, categories, nameById } = prepared;
  const limit = Math.min(options.limit ?? DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT);

  const where: {
    householdId: string;
    isDeleted: boolean;
    type: 'expense';
    categoryId: null;
    suggestedCategoryId: null;
    tags: { none: object };
    categorizationAttemptedAt?: null;
    id?: { in: string[] };
  } = {
    householdId,
    isDeleted: false,
    type: 'expense',
    categoryId: null,
    suggestedCategoryId: null,
    tags: { none: {} },
  };
  if (options.onlyUnattempted) {
    where.categorizationAttemptedAt = null;
  }
  if (options.transactionIds?.length) {
    where.id = { in: options.transactionIds };
  }

  const transactions = await prisma.budgetTransaction.findMany({
    where,
    include: { payee: { select: { name: true } } },
    orderBy: [{ transactionDate: 'desc' }],
    take: limit,
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
    const name = tx.payee?.name || tx.notes || 'Unknown transaction';
    counts.processed++;
    try {
      const result = await categorizeTransaction(apiKey, {
        name,
        amountIls: Number(tx.amountIls),
        notes: tx.notes,
        categories,
      });

      const chosenName = result.categoryId ? (nameById.get(result.categoryId) ?? null) : null;
      let status: 'suggested' | 'low_confidence' | 'no_match';

      if (!result.categoryId) {
        status = 'no_match';
        counts.noMatch++;
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: { categorizationAttemptedAt: new Date() },
        });
      } else if (result.confidence < CONFIDENCE_THRESHOLD) {
        status = 'low_confidence';
        counts.lowConfidence++;
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: { categorizationAttemptedAt: new Date() },
        });
      } else {
        status = 'suggested';
        counts.suggested++;
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: {
            suggestedCategoryId: result.categoryId,
            suggestionConfidence: result.confidence,
            suggestedAt: new Date(),
            categorizationAttemptedAt: new Date(),
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
      // Bounded cross-run retry: record the failure. A transient error leaves
      // the row unattempted so a later drain retries it, but once the failure
      // count hits the cap we stamp categorizationAttemptedAt to give up — a
      // persistent failure (bad key, sustained rate-limit) must not re-bill the
      // same transaction on every run.
      const nextErrorCount = (tx.categorizationErrorCount ?? 0) + 1;
      const giveUp = nextErrorCount >= MAX_CATEGORIZATION_ERRORS;
      try {
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: {
            categorizationErrorCount: nextErrorCount,
            ...(giveUp ? { categorizationAttemptedAt: new Date() } : {}),
          },
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
