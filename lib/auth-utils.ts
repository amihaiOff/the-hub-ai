import { stackServerApp } from '@/stack/server';
import { prisma } from '@/lib/db';
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
 * Check if auth bypass is enabled (only allowed in non-production environments)
 */
function isAuthBypassed(): boolean {
  return process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * Get the current user for API routes.
 * In development mode (when SKIP_AUTH=true and NODE_ENV !== 'production'),
 * returns a dev user without requiring OAuth.
 * In production, requires proper authentication via Stack Auth.
 * @returns The current user with guaranteed id, or null if not authenticated
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isAuthBypassed()) {
    // Ensure dev user exists in database (only once per server lifecycle)
    if (!devUserCreated) {
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
    }

    return {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
    };
  }

  // Production: require proper authentication via Stack Auth
  const stackUser = await stackServerApp.getUser();
  if (!stackUser) {
    return null;
  }

  // Upsert user in our database to ensure they exist
  const email = stackUser.primaryEmail;
  if (!email) {
    return null;
  }

  // Check email allowlist (if configured)
  if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email.toLowerCase())) {
    console.warn(`Sign-in denied for email: ${email} - not in allowlist`);
    return null;
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
