import { headers } from 'next/headers';
import { stackServerApp } from '@/stack/server';
import { isAuthBypassed } from '@/lib/auth-env';
import { prisma } from '@/lib/db';
import { acceptPendingInvitesForUser } from '@/lib/invites';
import { canAccessPath, isRestricted } from '@/lib/sections';
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
  const user = await getSignedInUser();
  if (!user) return null;

  // No household context here, so apply the most restrictive rule: the path
  // must be allowed by EVERY membership (an unrestricted one allows all).
  const memberships = await prisma.householdMember.findMany({
    where: { profile: { userId: user.id } },
    select: { allowedSections: true },
  });
  if (memberships.some((m) => isRestricted(m.allowedSections))) {
    const pathname = await currentPathname();
    if (!pathname || !memberships.every((m) => canAccessPath(pathname, m.allowedSections))) {
      console.warn(`Section access denied for user ${user.id} on ${pathname ?? '(unknown path)'}`);
      return null;
    }
  }
  return user;
}

/**
 * Signed-in, allowlisted user with any pending invites accepted. Invites are
 * accepted BEFORE any section check, so an invitee limited to some sections is
 * limited from their very first request. Section checks are the caller's job.
 */
async function getSignedInUser(): Promise<CurrentUser | null> {
  const user = await resolveSignedInUser();
  if (user?.email) {
    await acceptPendingInvitesForUser(user.id, user.email, user.name);
  }
  return user;
}

/**
 * Invite-based allowlist grant: a pending invite for this email, or an
 * accepted one whose household this email still belongs to. So an admin never
 * edits ALLOWED_EMAILS for invitees — and removing an invitee from the
 * household is what revokes them. Plain self-onboarded users get no grant, so
 * ALLOWED_EMAILS still revokes them.
 */
export async function hasInviteOrMembership(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const invite = await prisma.householdInvite.findFirst({
    where: {
      email: normalized,
      OR: [
        { acceptedAt: null, expiresAt: { gt: new Date() } },
        {
          acceptedAt: { not: null },
          household: {
            members: {
              some: {
                profile: { user: { email: { equals: normalized, mode: 'insensitive' } } },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return !!invite;
}

/**
 * Request path for section checks (HouseholdMember.allowedSections, see
 * lib/sections.ts), from the `x-pathname` header proxy.ts stamps on every /api
 * request. null outside a request scope — callers deny restricted users then.
 */
async function currentPathname(): Promise<string | null> {
  try {
    return (await headers()).get('x-pathname');
  } catch {
    return null;
  }
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

  // Check email allowlist (if configured), plus the invite grant.
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
  const user = await getSignedInUser();
  if (!user) {
    return null;
  }

  // (Pending invites were already accepted by getSignedInUser, so a fresh
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

  // Section restriction applies per household: the active one decides.
  if (isRestricted(activeHousehold.allowedSections)) {
    const pathname = await currentPathname();
    if (!pathname || !canAccessPath(pathname, activeHousehold.allowedSections)) {
      console.warn(`Section access denied for user ${user.id} on ${pathname ?? '(unknown path)'}`);
      return null;
    }
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
