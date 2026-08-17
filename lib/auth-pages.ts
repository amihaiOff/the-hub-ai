import { NextRequest } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { getPagesHouseholdIdFromToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';

/** The acting household + user for an Areas Pages request. */
export interface PagesAccess {
  householdId: string;
  userId: string;
}

/**
 * Resolve access to the Areas Pages API from either a logged-in session or a
 * scoped Bearer token (`AGENT_PAGES_TOKEN` / `API_SECRET`). Used by the read +
 * write page routes so headless agents can edit pages without a browser
 * session; DELETE routes stay session-only and keep calling `getCurrentContext`
 * directly.
 *
 * - Session path: the caller's active household + user (unchanged for real users).
 * - Token path: the single household + its owner user — the token has no session,
 *   so page creation is attributed to the household owner.
 *
 * @returns the acting household + user, or null if unauthenticated.
 */
export async function resolvePagesAccess(request: NextRequest): Promise<PagesAccess | null> {
  const context = await getCurrentContext();
  if (context) {
    return { householdId: context.activeHousehold.id, userId: context.user.id };
  }

  const householdId = await getPagesHouseholdIdFromToken(request);
  if (!householdId) return null;

  const userId = await resolveHouseholdOwnerUserId(householdId);
  if (!userId) return null;

  return { householdId, userId };
}
