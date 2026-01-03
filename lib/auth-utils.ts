import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
}

const DEV_USER_ID = 'dev-user-local';
const DEV_USER_EMAIL = 'dev@localhost';
const DEV_USER_NAME = 'Dev User';

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
 * In production, requires proper authentication.
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

  // Production: require proper authentication
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

/**
 * Check if auth is being skipped for development
 */
export function isDevAuthMode() {
  return isAuthBypassed();
}
