import { headers } from 'next/headers';
import { stackServerApp } from '@/stack/server';
import { isAuthBypassed } from '@/lib/auth-env';
import { prisma } from '@/lib/db';
import { acceptPendingInvitesForUser } from '@/lib/invites';
import { canAccessPath } from '@/lib/sections';
import type { HouseholdRole } from '@prisma/client';

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface CurrentProfile {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  userId: string | null;
}

export interface CurrentHousehold {
  id: string;
  name: string;
  description: string | null;
  role: HouseholdRole;
  /** Sections the current user may see in this household; empty = all. */
  allowedSections?: string[];
}

export interface HouseholdProfile {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  role: HouseholdRole;
  hasUser: boolean;
}

export interface CurrentContext {
  user: CurrentUser;
  profile: CurrentProfile;
  households: CurrentHousehold[];
  activeHousehold: CurrentHousehold;
  householdProfiles: HouseholdProfile[];
}

const DEV_USER_ID = 'dev-user-local';
const DEV_USER_EMAIL = 'dev@localhost';
const DEV_USER_NAME = 'Dev User';

// Email allowlist - only these emails can access the app
const ALLOWED_EMAILS =
  process.env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];

// Cache flag to avoid repeated database upserts in dev mode
let devUserCreated = false;

/**
 * Get the current user for API routes.
 * When the dev auth bypass applies (see `isAuthBypassed` in
 * `lib/auth-env.ts` — local dev and Vercel preview, never production),
 * returns a canned dev user without requiring OAuth.
 * Otherwise requires proper authentication via Stack Auth.
 * @returns The current user with guaranteed id, or null if not authenticated
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await resolveSignedInUser();
  if (!user) return null;

  // Accept any pending household invite BEFORE the section check below, so an
  // invitee limited to some sections is limited from their very first request.
  if (user.email) {
    await acceptPendingInvitesForUser(user.id, user.email, user.name);
  }

  if (!(await canUserAccessCurrentPath(user.id))) {
    return null;
  }
  return user;
}

/**
 * A pending invite or an existing household membership is an implicit
 * allowlist grant, so an admin never has to edit ALLOWED_EMAILS to let an
 * invited member in (or keep them in after the invite is accepted).
 */
export async function hasInviteOrMembership(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const [invite, member] = await Promise.all([
    prisma.householdInvite.findFirst({
      where: { email: normalized, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        profile: { householdMemberships: { some: {} } },
      },
      select: { id: true },
    }),
  ]);
  return !!invite || !!member;
}

/**
 * Section restriction (HouseholdMember.allowedSections, see lib/sections.ts).
 * The request path comes from the `x-pathname` header that proxy.ts stamps on
 * every /api request. A restricted user whose path is unknown is denied.
 *
 * ponytail: union of the user's restricted memberships — exact for one
 * household; make it per-active-household if a restricted user ever joins two.
 */
async function canUserAccessCurrentPath(userId: string): Promise<boolean> {
  const memberships = await prisma.householdMember.findMany({
    where: { profile: { userId } },
    select: { allowedSections: true },
  });
  if (memberships.length === 0 || memberships.some((m) => m.allowedSections.length === 0)) {
    return true; // no membership yet (onboarding) or unrestricted somewhere
  }
  const allowed = memberships.flatMap((m) => m.allowedSections);
  let pathname: string | null = null;
  try {
    pathname = (await headers()).get('x-pathname');
  } catch {
    pathname = null; // outside a request scope
  }
  if (pathname && canAccessPath(pathname, allowed)) return true;
  console.warn(`Section access denied for user ${userId} on ${pathname ?? '(unknown path)'}`);
  return false;
}

async function resolveSignedInUser(): Promise<CurrentUser | null> {
  if (isAuthBypassed()) {
    // Ensure dev user exists in database (only once per server lifecycle)
    // Use a best-effort upsert — if it fails (e.g. transient Neon connection error),
    // still return the dev user since it's likely already present from seed.
    if (!devUserCreated) {
      try {
        await prisma.user.upsert({
          where: { id: DEV_USER_ID },
          update: {},
          create: {
            id: DEV_USER_ID,
            email: DEV_USER_EMAIL,
            name: DEV_USER_NAME,
          },
        });
        devUserCreated = true;
        console.warn('[DEV MODE] Auth bypass enabled - NEVER use in production');
      } catch (err) {
        console.warn('[DEV MODE] Dev user upsert failed (may already exist):', err);
        devUserCreated = true; // Assume it exists (from seed), don't retry
      }
    }

    return {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
    };
  }

  // Production: require proper authentication via Stack Auth.
  // No client means either the env vars aren't configured or the bypass was
  // refused for this environment. Treat that as "not signed in" so callers
  // send the user to the sign-in flow — never throw, which would surface as a
  // 500 on every authenticated route.
  if (!stackServerApp) {
    console.warn('Stack Auth is not configured; treating request as unauthenticated');
    return null;
  }
  const stackUser = await stackServerApp.getUser();
  if (!stackUser) {
    return null;
  }

  // Upsert user in our database to ensure they exist
  const email = stackUser.primaryEmail;
  if (!email) {
    return null;
  }

  // Check email allowlist (if configured), plus the invite/membership grant.
  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    if (!(await hasInviteOrMembership(email))) {
      console.warn(`Sign-in denied for email: ${email} - not in allowlist`);
      return null;
    }
  }

  const dbUser = await prisma.user.upsert({
    where: { email },
    update: {
      name: stackUser.displayName,
    },
    create: {
      email,
      name: stackUser.displayName,
    },
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
  };
}

/**
 * Check if auth is being skipped for development
 */
export function isDevAuthMode() {
  return isAuthBypassed();
}

/**
 * Get the current context for API routes, including profile and household.
 * This should be used for API routes that need to access profile/household data.
 *
 * @param activeHouseholdId - Optional household ID from request headers/cookies
 * @returns Full context with user, profile, and household info, or null if not authenticated
 */
export async function getCurrentContext(
  activeHouseholdId?: string
): Promise<CurrentContext | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  // (Pending invites were already accepted by getCurrentUser, so a fresh
  // sign-in with an invite waiting skips onboarding.)

  // Get profile with household memberships
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    include: {
      householdMemberships: {
        include: {
          household: true,
        },
      },
    },
  });

  // If no profile, user needs onboarding
  if (!profile) {
    return null;
  }

  // Build list of households with roles
  const households: CurrentHousehold[] = profile.householdMemberships.map((m) => ({
    id: m.household.id,
    name: m.household.name,
    description: m.household.description,
    role: m.role,
    allowedSections: m.allowedSections,
  }));

  // Determine active household
  let activeHousehold: CurrentHousehold | undefined;

  if (activeHouseholdId) {
    activeHousehold = households.find((h) => h.id === activeHouseholdId);
  }

  // Default to first household if not specified or not found
  if (!activeHousehold && households.length > 0) {
    activeHousehold = households[0];
  }

  // If no households, this shouldn't happen after migration but handle gracefully
  if (!activeHousehold) {
    return null;
  }

  // Get all profiles in the active household
  const householdMembers = await prisma.householdMember.findMany({
    where: { householdId: activeHousehold.id },
    include: {
      profile: true,
    },
  });

  const householdProfiles: HouseholdProfile[] = householdMembers.map((m) => ({
    id: m.profile.id,
    name: m.profile.name,
    image: m.profile.image,
    color: m.profile.color,
    role: m.role,
    hasUser: m.profile.userId !== null,
  }));

  return {
    user,
    profile: {
      id: profile.id,
      name: profile.name,
      image: profile.image,
      color: profile.color,
      userId: profile.userId,
    },
    households,
    activeHousehold,
    householdProfiles,
  };
}

/**
 * Get profile IDs that the current user can access in the active household.
 * Used for filtering assets.
 *
 * @param context - Current context from getCurrentContext
 * @returns Array of profile IDs in the active household
 */
export function getAccessibleProfileIds(context: CurrentContext): string[] {
  return context.householdProfiles.map((p) => p.id);
}

/**
 * Check if the current user has admin/owner role in the active household.
 *
 * @param context - Current context from getCurrentContext
 * @returns true if user is admin or owner
 */
export function isHouseholdAdmin(context: CurrentContext): boolean {
  return context.activeHousehold.role === 'owner' || context.activeHousehold.role === 'admin';
}
