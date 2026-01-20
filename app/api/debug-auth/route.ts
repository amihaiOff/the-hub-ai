import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';

// Helper to safely stringify errors including ErrorEvent
function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    return JSON.stringify({
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    });
  }
  if (typeof err === 'object' && err !== null) {
    // Handle ErrorEvent and other objects
    const obj = err as Record<string, unknown>;
    return JSON.stringify({
      type: obj.type || 'unknown',
      message: obj.message || String(err),
      error: obj.error ? String(obj.error) : undefined,
      constructor: obj.constructor?.name,
    });
  }
  return String(err);
}

// Extract host from DATABASE_URL safely
function getDatabaseHost(url: string | undefined): string {
  if (!url) return '(not set)';
  try {
    const match = url.match(/@([^:/]+)/);
    return match ? match[1] : '(could not parse)';
  } catch {
    return '(parse error)';
  }
}

/**
 * GET /api/debug-auth
 * Debug endpoint to check auth status - REMOVE IN PRODUCTION
 */
export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    const isNeonDatabase = dbUrl?.includes('neon.tech') || false;

    // Check environment
    const envCheck = {
      hasProjectId: !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID,
      projectIdPrefix: process.env.NEXT_PUBLIC_STACK_PROJECT_ID?.substring(0, 8) + '...',
      hasClientKey: !!process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
      hasServerKey: !!process.env.STACK_SECRET_SERVER_KEY,
      allowedEmails: process.env.ALLOWED_EMAILS || '(not set)',
      hasDatabaseUrl: !!dbUrl,
      databaseHost: getDatabaseHost(dbUrl),
      isNeonDatabase,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV || '(not on vercel)',
      vercelRegion: process.env.VERCEL_REGION || '(not set)',
    };

    // Check cookies
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const cookieNames = allCookies.map((c) => c.name);
    const stackCookies = allCookies.filter((c) => c.name.toLowerCase().includes('stack'));

    // Try to get the Stack Auth user
    let stackUserInfo = null;
    let stackError = null;

    try {
      const stackUser = await stackServerApp.getUser();
      if (stackUser) {
        stackUserInfo = {
          id: stackUser.id,
          email: stackUser.primaryEmail,
          displayName: stackUser.displayName,
        };
      }
    } catch (err) {
      stackError = stringifyError(err);
    }

    // Test database connectivity with detailed error capture
    let dbStatus = null;
    let dbError = null;
    let dbErrorRaw = null;
    try {
      const startTime = Date.now();
      const userCount = await prisma.user.count();
      const profileCount = await prisma.profile.count();
      const duration = Date.now() - startTime;
      dbStatus = { connected: true, userCount, profileCount, queryTimeMs: duration };
    } catch (err) {
      dbError = stringifyError(err);
      dbErrorRaw = String(err);
    }

    // Test getCurrentUser
    let currentUserResult = null;
    let currentUserError = null;
    try {
      const currentUser = await getCurrentUser();
      currentUserResult = currentUser;
    } catch (err) {
      currentUserError = stringifyError(err);
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      envCheck,
      cookies: {
        total: allCookies.length,
        names: cookieNames,
        stackCookies: stackCookies.map((c) => ({
          name: c.name,
          value: c.value.substring(0, 20) + '...',
        })),
      },
      stackUser: stackUserInfo,
      stackError,
      isAuthenticated: !!stackUserInfo,
      database: dbStatus,
      dbError,
      dbErrorRaw,
      currentUser: currentUserResult,
      currentUserError,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: stringifyError(error),
        errorRaw: String(error),
      },
      { status: 500 }
    );
  }
}
