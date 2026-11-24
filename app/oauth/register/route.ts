import { NextResponse } from 'next/server';
import { signMcpToken } from '@/lib/mcp/tokens';

/**
 * Only Claude may connect: claude.ai / claude.com's connector callback, or a
 * loopback callback (Claude Code on the user's machine). Anything else could
 * be an attacker's page phishing a one-click "Allow".
 */
const CLAUDE_CALLBACKS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

function isAllowedRedirect(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  if (CLAUDE_CALLBACKS.includes(uri)) return true;
  try {
    const u = new URL(uri);
    return (
      u.protocol === 'http:' && !u.hash && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Dynamic client registration (RFC 7591). Stateless: the client id IS the
 * signed list of redirect URIs, so /oauth/authorize can check them without a DB.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const redirectUris: unknown = body?.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every(isAllowedRedirect)
  ) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description:
          "redirect_uris must be Claude's connector callback or a localhost callback",
      },
      { status: 400 }
    );
  }
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : undefined;
  const clientId = signMcpToken('client', { redirect_uris: redirectUris, name });
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201 }
  );
}
