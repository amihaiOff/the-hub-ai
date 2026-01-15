import { NextRequest, NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { cookies } from 'next/headers';

/**
 * GET /api/debug-auth
 * Debug endpoint to check auth status - REMOVE IN PRODUCTION
 */
export async function GET(request: NextRequest) {
  try {
    // Check if Stack Auth env vars are set
    const envCheck = {
      hasProjectId: !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID,
      projectIdPrefix: process.env.NEXT_PUBLIC_STACK_PROJECT_ID?.substring(0, 8) + '...',
      hasClientKey: !!process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
      hasServerKey: !!process.env.STACK_SECRET_SERVER_KEY,
      allowedEmails: process.env.ALLOWED_EMAILS || '(not set)',
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
      stackError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
