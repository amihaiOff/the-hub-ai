import { NextResponse, type NextRequest } from 'next/server';
import { mcpBlockReason } from '@/lib/mcp/blocked';
import { MCP_TOKEN_PREFIX } from '@/lib/mcp/tokens';

/**
 * Stamps the request path on every /api request so getCurrentUser
 * (lib/auth-utils.ts) can enforce a member's section restriction in one place.
 * Overwrites any client-sent value, so it can't be spoofed.
 *
 * Also refuses the few calls Claude (an MCP access token) may never make —
 * see lib/mcp/blocked.ts. A blocked call is refused whether or not the token
 * is valid, so there's no need to verify it here.
 */
export function proxy(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith(`Bearer ${MCP_TOKEN_PREFIX}`)) {
    const reason = mcpBlockReason(request.method, request.nextUrl.pathname);
    if (reason) {
      return NextResponse.json(
        { success: false, error: `Claude is not allowed to do this (${reason}).` },
        { status: 403 }
      );
    }
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: '/api/:path*' };
