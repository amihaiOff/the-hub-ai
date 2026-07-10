import { suggestCategoriesForHousehold } from '@/lib/ai/suggest-categories';

// Bounded so a post-response pass comfortably fits under the route's
// maxDuration. Whatever isn't reached is picked up by another pass (a later
// read, the next import, or the daily backstop drain).
const POST_IMPORT_SUGGESTION_LIMIT = 15;
const POST_IMPORT_DEADLINE_MS = 40_000;
const READ_TRIGGER_LIMIT = 15;
const READ_TRIGGER_DEADLINE_MS = 40_000;

/**
 * Fire-and-forget AI categorization pass, run via Next.js `after()` so it never
 * blocks the response. Only touches transactions the AI has never attempted,
 * and swallows all errors — a failure here must never surface to the caller.
 */
async function runBackgroundSuggestion(
  householdId: string,
  label: string,
  limit: number,
  deadlineMs: number
): Promise<void> {
  try {
    const result = await suggestCategoriesForHousehold(householdId, {
      limit,
      onlyUnattempted: true,
      deadlineMs,
    });
    if (!result.ok) {
      // No API key / no categories configured — nothing to do.
      console.info(`${label} categorization skipped for ${householdId}: ${result.reason}`);
    }
  } catch (err) {
    console.error(`${label} categorization failed:`, err);
  }
}

/**
 * Run right after an import so a typical import shows suggestions within
 * seconds. The daily backstop / read passes clear anything this doesn't reach.
 */
export function runPostImportSuggestion(householdId: string): Promise<void> {
  return runBackgroundSuggestion(
    householdId,
    'Post-import',
    POST_IMPORT_SUGGESTION_LIMIT,
    Date.now() + POST_IMPORT_DEADLINE_MS
  );
}

/**
 * Run when the user views their uncategorized transactions. Activity-driven
 * draining that keeps suggestions flowing without a frequent cron (the Vercel
 * Hobby plan caps crons at once/day). Self-limiting: once every row has been
 * attempted, this finds nothing and does nothing but a cheap count query.
 */
export function runReadTriggeredSuggestion(householdId: string): Promise<void> {
  return runBackgroundSuggestion(
    householdId,
    'Read-triggered',
    READ_TRIGGER_LIMIT,
    Date.now() + READ_TRIGGER_DEADLINE_MS
  );
}
