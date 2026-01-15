import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';

/**
 * GET /api/debug-auth
 * Debug endpoint to check auth status - REMOVE IN PRODUCTION
 */
export async function GET() {
  try {
    // Check if Stack Auth env vars are set
    const envCheck = {
      hasProjectId: !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID,
      hasClientKey: !!process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
      hasServerKey: !!process.env.STACK_SECRET_SERVER_KEY,
      allowedEmails: process.env.ALLOWED_EMAILS || '(not set)',
    };

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
