/**
 * proxy.ts: stamps x-pathname on every /api request and refuses the MCP
 * block list for requests carrying a Hub MCP bearer token.
 */
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

function req(method: string, path: string, auth?: string) {
  return new NextRequest(`http://localhost:3001${path}`, {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

/** The x-pathname the proxy forwards to the route (NextResponse.next request headers). */
function forwardedPathname(res: Response): string | null {
  return res.headers.get('x-middleware-request-x-pathname');
}

describe('proxy', () => {
  it('returns 403 for an MCP bearer on a blocked call', async () => {
    const res = proxy(req('DELETE', '/api/pages/p1', 'Bearer hubmcp_abc.def'));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it('blocks regardless of token validity and for trailing slashes', () => {
    expect(proxy(req('POST', '/api/restore/', 'Bearer hubmcp_garbage')).status).toBe(403);
    expect(proxy(req('GET', '/api/settings/anthropic-key', 'Bearer hubmcp_x')).status).toBe(403);
  });

  it.each([
    ['GET', '/api/backup'],
    ['GET', '/api/agent/backlog'],
    ['GET', '/api/cron/update-stock-prices'],
    ['GET', '/api/widget/tasks'],
    ['GET', '/api/debug-auth'],
    ['PATCH', '/api/households/h1/members/m1'],
    ['GET', '/api/households/h1/members'],
    ['POST', '/api/households/h1/invites'],
    ['POST', '/api/pages/p1/share'],
    ['GET', '/api//backup'],
    ['GET', '/api/BACKUP'],
    ['GET', '/api/%62ackup'],
    ['DELETE', '/api/pages/%70'],
    ['GET', '/api/tasks/%E0%A4%A'],
  ])('blocks MCP %s %s', (m, p) => {
    expect(proxy(req(m, p, 'Bearer hubmcp_x')).status).toBe(403);
  });

  it.each([
    ['GET', '/api/households/h1/invites'],
    ['GET', '/api/pages/p1/share'],
    ['GET', '/api/tasks/t1'],
  ])('allows MCP %s %s', (m, p) => {
    expect(proxy(req(m, p, 'Bearer hubmcp_x')).status).toBe(200);
  });

  it('lets an MCP bearer through on an allowed call and stamps x-pathname', () => {
    const res = proxy(req('GET', '/api/pages/p1', 'Bearer hubmcp_abc.def'));
    expect(res.status).toBe(200);
    expect(forwardedPathname(res)).toBe('/api/pages/p1');
  });

  it('does not block a non-MCP bearer on a blocked path', () => {
    const res = proxy(req('DELETE', '/api/pages/p1', 'Bearer some-agent-token'));
    expect(res.status).toBe(200);
    expect(forwardedPathname(res)).toBe('/api/pages/p1');
  });

  it('does not block a cookie session (no bearer)', () => {
    const res = proxy(req('DELETE', '/api/households/h1'));
    expect(res.status).toBe(200);
    expect(forwardedPathname(res)).toBe('/api/households/h1');
  });

  it('overwrites a client-sent x-pathname', () => {
    const r = new NextRequest('http://localhost:3001/api/budget/summary', {
      headers: { 'x-pathname': '/api/spoofed' },
    });
    expect(forwardedPathname(proxy(r))).toBe('/api/budget/summary');
  });
});
