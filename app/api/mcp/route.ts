import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createHubMcpServer, type ApiCaller } from '@/lib/mcp/server';
import { MCP_TOKEN_PREFIX, verifyMcpToken } from '@/lib/mcp/tokens';

export const maxDuration = 60;

/**
 * The Hub MCP endpoint (Streamable HTTP, stateless). Auth is an OAuth access
 * token from /oauth/token; each tool call forwards it to the app's own API,
 * where lib/auth-utils.ts resolves it to the user who approved the connection.
 */
async function handle(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith(`Bearer ${MCP_TOKEN_PREFIX}`) ? auth.slice(7) : null;
  if (!verifyMcpToken('access', token)) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    });
  }

  const api: ApiCaller = async (method, path, opts = {}) => {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.pathname !== path) {
      return { ok: false, status: 400, text: `Invalid path ${path}` };
    }
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null)
        url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  };

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await createHubMcpServer(api).connect(transport);
  return transport.handleRequest(request);
}

/** Stateless server: no standalone SSE stream (it would pin a function until maxDuration). */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST, DELETE' } });
}

export { handle as POST, handle as DELETE };
