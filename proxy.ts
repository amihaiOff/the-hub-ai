import { NextResponse, type NextRequest } from 'next/server';

/**
 * Stamps the request path on every /api request so getCurrentUser
 * (lib/auth-utils.ts) can enforce a member's section restriction in one place.
 * Overwrites any client-sent value, so it can't be spoofed.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: '/api/:path*' };
