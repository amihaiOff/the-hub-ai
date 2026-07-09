import { suggestCategoriesForHousehold } from '@/lib/ai/suggest-categories';

// Bounded so the post-response pass comfortably fits under the route's
// maxDuration even after a large import. The cron drain clears the rest.
const POST_IMPORT_SUGGESTION_LIMIT = 15;

/**
 * Best-effort AI categorization pass to run right after an import (via
 * Next.js `after()`), giving the user near-instant suggestions for a typical
 * import. Only touches transactions the AI has never attempted, and swallows
 * all errors — a failure here must never surface to the import caller, whose
 * transactions are already saved.
 */
export async function runPostImportSuggestion(householdId: string): Promise<void> {
  try {
    const result = await suggestCategoriesForHousehold(householdId, {
      limit: POST_IMPORT_SUGGESTION_LIMIT,
      onlyUnattempted: true,
    });
    if (!result.ok) {
      // No API key / no categories configured — nothing to do. The cron drain
      // will keep skipping too until the household sets things up.
      console.info(`Post-import categorization skipped for ${householdId}: ${result.reason}`);
    }
  } catch (err) {
    console.error('Post-import categorization failed:', err);
  }
}
