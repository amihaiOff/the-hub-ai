/**
 * API calls the Hub MCP connector (Claude) may never make, enforced in
 * proxy.ts for any request carrying an MCP access token — whether it comes
 * through an MCP tool or straight from someone holding the token. Everything
 * else the signed-in user can do, Claude can do on their behalf.
 */

/** Whole API areas that aren't the user's data or would bypass the rules below. */
export const BLOCKED_AREAS = [
  'agent',
  'backup', // full DB dump, incl. the stored Anthropic key
  'cron',
  'debug',
  'debug-auth',
  'restore',
  'widget',
];

const BLOCKED: { method: string; path: RegExp; reason: string }[] = [
  {
    method: '*',
    path: new RegExp(`^/api/(${BLOCKED_AREAS.join('|')})(/|$)`),
    reason: 'internal or whole-database endpoint',
  },
  { method: 'DELETE', path: /^\/api\/pages\/[^/]+$/, reason: 'deleting an Areas page' },
  {
    method: 'DELETE',
    path: /^\/api\/pages\/sections\/[^/]+$/,
    reason: 'deleting an Areas section',
  },
  { method: 'DELETE', path: /^\/api\/households\/[^/]+$/, reason: 'deleting the household' },
  // Who can see the data stays a human decision: a prompt-injected instruction
  // must not be able to invite an outsider, change roles or publish a page.
  {
    method: '*',
    path: /^\/api\/households\/[^/]+\/members(\/|$)/,
    reason: 'changing household members',
  },
  {
    method: 'POST',
    path: /^\/api\/households\/[^/]+\/invites$/,
    reason: 'inviting someone to the household',
  },
  { method: 'POST', path: /^\/api\/pages\/[^/]+\/share$/, reason: 'sharing a page publicly' },
  {
    method: '*',
    path: /^\/api\/settings\/anthropic-key(\/|$)/,
    reason: 'accessing the stored Anthropic API key',
  },
];

/** Why this call is blocked for MCP, or null if allowed. Undecodable paths are blocked. */
export function mcpBlockReason(method: string, pathname: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname)
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  } catch {
    return 'malformed path';
  }
  const m = method.toUpperCase();
  const hit = BLOCKED.find((b) => (b.method === '*' || b.method === m) && b.path.test(path));
  return hit ? hit.reason : null;
}
