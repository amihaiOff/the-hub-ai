import { NextResponse } from 'next/server';

/**
 * Protected-resource metadata (RFC 9728) for /api/mcp. Optional catch-all so
 * the path-suffixed form (/.well-known/oauth-protected-resource/api/mcp) works too.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['hub'],
    bearer_methods_supported: ['header'],
  });
}
