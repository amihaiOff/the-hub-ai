import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

/** Pull the `Bearer <token>` value from the Authorization header, or null. */
function bearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/** Timing-safe equality against any of the configured (non-empty) secrets. */
function matchesAny(token: string, secrets: (string | undefined)[]): boolean {
  const tokenBuf = Buffer.from(token);
  return secrets.some((secret) => {
    if (!secret) return false;
    const secretBuf = Buffer.from(secret);
    return tokenBuf.length === secretBuf.length && timingSafeEqual(tokenBuf, secretBuf);
  });
}

/** First household in the DB (this app is single-household). */
async function firstHouseholdId(): Promise<string | null> {
  const household = await prisma.household.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return household?.id ?? null;
}

/**
 * Validate the full-access API key and resolve the household.
 *
 * Usage: `Authorization: Bearer <API_SECRET>`. Grants write operations (e.g.
 * CSV import), so this secret should be closely held.
 *
 * @returns householdId if authenticated, null otherwise
 */
export async function getHouseholdIdFromApiKey(request: NextRequest): Promise<string | null> {
  const token = bearerToken(request);
  if (!token) return null;
  if (!matchesAny(token, [process.env.API_SECRET, process.env.UPLOAD_SCRIPT_API_KEY])) {
    return null;
  }
  return firstHouseholdId();
}

/**
 * Validate a key scoped to the Areas Pages API and resolve the household.
 * Accepts a dedicated `AGENT_PAGES_TOKEN` — safe to hand to a page-editing agent
 * because it only unlocks the read + write page routes (never delete, never any
 * other data) — plus the full-access `API_SECRET` / `UPLOAD_SCRIPT_API_KEY` so
 * an admin token keeps working. Deliberately does NOT honour `AGENT_READ_TOKEN`
 * (that stays read-only for the backlog endpoint).
 *
 * @returns householdId if authenticated, null otherwise
 */
export async function getPagesHouseholdIdFromToken(request: NextRequest): Promise<string | null> {
  const token = bearerToken(request);
  if (!token) return null;
  if (
    !matchesAny(token, [
      process.env.AGENT_PAGES_TOKEN,
      process.env.API_SECRET,
      process.env.UPLOAD_SCRIPT_API_KEY,
    ])
  ) {
    return null;
  }
  return firstHouseholdId();
}

/**
 * Resolve the user id of a household's owner. Used when a session-less token
 * request needs an acting user (e.g. `ownerId` on page creation): the token
 * carries no session user, so writes are attributed to the household owner.
 * Returns the earliest-joined owner member's linked user, or null if no owner
 * has a login user.
 */
export async function resolveHouseholdOwnerUserId(householdId: string): Promise<string | null> {
  const owner = await prisma.householdMember.findFirst({
    where: { householdId, role: 'owner', profile: { userId: { not: null } } },
    orderBy: { joinedAt: 'asc' },
    select: { profile: { select: { userId: true } } },
  });
  return owner?.profile.userId ?? null;
}

/**
 * Validate a key for the read-only agent endpoints (`/api/agent/*`) and resolve
 * the household. Accepts a dedicated `AGENT_READ_TOKEN` — safe to hand to a
 * Claude Code agent because it's only honoured by read endpoints — and also the
 * full-access `API_SECRET` so an admin token keeps working.
 *
 * @returns householdId if authenticated, null otherwise
 */
export async function getHouseholdIdFromAgentKey(request: NextRequest): Promise<string | null> {
  const token = bearerToken(request);
  if (!token) return null;
  if (
    !matchesAny(token, [
      process.env.AGENT_READ_TOKEN,
      process.env.API_SECRET,
      process.env.UPLOAD_SCRIPT_API_KEY,
    ])
  ) {
    return null;
  }
  return firstHouseholdId();
}
