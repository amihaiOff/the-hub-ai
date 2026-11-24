import { NextResponse } from 'next/server';
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  clientFingerprint,
  pkceMatches,
  signMcpToken,
  verifyMcpToken,
  type McpCode,
  type McpRefresh,
} from '@/lib/mcp/tokens';

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

function issue(uid: string, cid: string) {
  return NextResponse.json(
    {
      access_token: signMcpToken('access', { uid }, ACCESS_TTL_SECONDS),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: signMcpToken('refresh', { uid, cid }, REFRESH_TTL_SECONDS),
      scope: 'hub',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** OAuth token endpoint: authorization_code (with PKCE) and refresh_token grants. */
export async function POST(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  const raw: unknown = type.includes('application/json')
    ? await request.json().catch(() => null)
    : Object.fromEntries(new URLSearchParams(await request.text()));
  const params: Record<string, string> = Object.fromEntries(
    Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(
      ([, v]) => typeof v === 'string'
    )
  );

  const clientId = params.client_id;
  if (!clientId || !verifyMcpToken('client', clientId)) {
    return oauthError('invalid_client', 'Unknown client', 401);
  }
  const cid = clientFingerprint(clientId);

  if (params.grant_type === 'authorization_code') {
    const code = verifyMcpToken<McpCode>('code', params.code);
    if (!code || code.cid !== cid || code.ru !== params.redirect_uri) {
      return oauthError('invalid_grant', 'Invalid or expired code');
    }
    if (!params.code_verifier || !pkceMatches(params.code_verifier, code.cc)) {
      return oauthError('invalid_grant', 'PKCE verification failed');
    }
    return issue(code.uid, cid);
  }

  if (params.grant_type === 'refresh_token') {
    const refresh = verifyMcpToken<McpRefresh>('refresh', params.refresh_token);
    if (!refresh || refresh.cid !== cid) {
      return oauthError('invalid_grant', 'Invalid or expired refresh token');
    }
    return issue(refresh.uid, cid);
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
}
