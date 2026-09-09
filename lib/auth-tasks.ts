import { NextRequest } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { getTasksHouseholdIdFromToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';

/** The acting household + user for a Tasks API request. */
export interface TasksAccess {
  householdId: string;
  userId: string;
}

/**
 * Resolve access to the Tasks API from either a logged-in session or a scoped
 * Bearer token (`AGENT_TASKS_TOKEN` / `API_SECRET`). Mirrors `resolvePagesAccess`
 * in `lib/auth-pages.ts` — the task read + create routes use it so headless
 * agents can file tasks without a browser session. PATCH, DELETE and every
 * category/tag mutation stay session-only and keep calling `getCurrentContext`
 * directly, which keeps the token's write surface create-only: it can add a
 * task but never overwrite or remove one.
 *
 * - Session path: the caller's active household + user (unchanged for real users).
 * - Token path: the single household + its owner user — the token has no session,
 *   so task creation is attributed to the household owner.
 *
 * ATTRIBUTION: on the token path `userId` is the earliest-joined household
 * owner's user, which becomes the new task's `ownerId`. That's what makes an
 * agent-filed task show up in the owner's own Tasks list, indistinguishable
 * from one they typed. Consequence worth knowing: `GET /api/tasks` narrows to
 * "owned by me OR shared with me", so if a second household member ever drives
 * the agent, their tasks land under the owner's ownership and stay invisible in
 * their own list. Acceptable for a single-owner household; the fix (an owner
 * override, or auto-sharing with every member) is additive.
 *
 * @returns the acting household + user, or null if unauthenticated.
 */
export async function resolveTasksAccess(request: NextRequest): Promise<TasksAccess | null> {
  const context = await getCurrentContext();
  if (context) {
    return { householdId: context.activeHousehold.id, userId: context.user.id };
  }

  const householdId = await getTasksHouseholdIdFromToken(request);
  if (!householdId) return null;

  const userId = await resolveHouseholdOwnerUserId(householdId);
  if (!userId) return null;

  return { householdId, userId };
}
