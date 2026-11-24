import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless, HMAC-signed OAuth artefacts for the Hub MCP connector: the
 * registered client id, the authorization code, and the access/refresh
 * tokens are all `hubmcp_<payload>.<sig>` strings signed with MCP_AUTH_SECRET.
 * Nothing is stored in the database.
 *
 * ponytail: no per-token revocation — rotating MCP_AUTH_SECRET disconnects
 * every connection at once, and removing a user from the allowlist/household
 * cuts them off on their next request. Add a token table if per-connection
 * revoke is ever needed. Codes are not single-use (PKCE + 5 min expiry instead).
 */

export const MCP_TOKEN_PREFIX = 'hubmcp_';

export type McpTokenKind = 'client' | 'code' | 'access' | 'refresh';

export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;
export const CODE_TTL_SECONDS = 5 * 60;

function secret(): string | null {
  const s = process.env.MCP_AUTH_SECRET;
  return s && s.length >= 32 ? s : null;
}

function hmac(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

/** Sign `payload` as a token of `kind`. Throws if MCP_AUTH_SECRET is unset/short. */
export function signMcpToken(
  kind: McpTokenKind,
  payload: Record<string, unknown>,
  ttlSeconds?: number
): string {
  const key = secret();
  if (!key) throw new Error('MCP_AUTH_SECRET is not configured (min 32 chars)');
  const body: Record<string, unknown> = { ...payload, k: kind };
  if (ttlSeconds) body.exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${MCP_TOKEN_PREFIX}${data}.${hmac(data, key)}`;
}

/** Verify a token of `kind`; returns its payload, or null if forged/expired/wrong kind. */
export function verifyMcpToken<T extends Record<string, unknown>>(
  kind: McpTokenKind,
  token: string | null | undefined
): T | null {
  const key = secret();
  if (!key || typeof token !== 'string' || !token.startsWith(MCP_TOKEN_PREFIX)) return null;
  const parts = token.slice(MCP_TOKEN_PREFIX.length).split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = Buffer.from(hmac(data, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (body.k !== kind) return null;
    if (typeof body.exp === 'number' && body.exp < Date.now() / 1000) return null;
    return body as T;
  } catch {
    return null;
  }
}

/** PKCE S256: base64url(sha256(verifier)) === challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

export interface McpClient extends Record<string, unknown> {
  redirect_uris: string[];
  name?: string;
}
export interface McpCode extends Record<string, unknown> {
  uid: string;
  cid: string;
  ru: string;
  cc: string;
}
export interface McpAccess extends Record<string, unknown> {
  uid: string;
}
export interface McpRefresh extends Record<string, unknown> {
  uid: string;
  cid: string;
}

/** Short stable fingerprint of a client id, so codes/refresh tokens stay small. */
export function clientFingerprint(clientId: string): string {
  return createHash('sha256').update(clientId).digest('base64url').slice(0, 22);
}
