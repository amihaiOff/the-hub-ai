/**
 * app/api/mcp: auth gate, GET 405, and the self-fetch guard that refuses a
 * path URL parsing would turn into a different route/origin.
 */
import { GET, POST } from '@/app/api/mcp/route';
import { signMcpToken } from '../tokens';

process.env.MCP_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

function rpc(body: unknown, auth?: string) {
  return new Request('http://localhost:3001/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(auth && { authorization: auth }),
    },
    body: JSON.stringify(body),
  });
}

const bearer = () => `Bearer ${signMcpToken('access', { uid: 'u1' }, 60)}`;
const callTool = (name: string, args: unknown) =>
  rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, bearer());

describe('/api/mcp', () => {
  it('GET returns 405 (no standalone SSE stream)', () => {
    expect(GET().status).toBe(405);
  });

  it('POST without a valid access token returns 401 with resource metadata', async () => {
    for (const auth of [
      undefined,
      'Bearer other',
      `Bearer ${signMcpToken('refresh', { uid: 'u1' }, 60)}`,
    ]) {
      const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, auth));
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toContain('oauth-protected-resource');
    }
  });

  it('forwards a tool call to the app API with the same bearer', async () => {
    const auth = bearer();
    const res = await POST(
      rpc(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_budget_summary', arguments: { month: '2026-10' } },
        },
        auth
      )
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:3001/api/budget/summary?month=2026-10');
    expect(init.headers.Authorization).toBe(auth);
  });

  it.each(['..', '.'])('refuses a curated-tool id (%s) that would change the path', async (id) => {
    const res = await POST(callTool('update_task', { id, title: 'x' }));
    const body = await res.json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Invalid path');
  });

  it('call_app_action refuses paths that are not catalog actions', async () => {
    const res = await POST(callTool('call_app_action', { method: 'GET', path: '/api/backup' }));
    const body = await res.json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.result.isError).toBe(true);
  });
});
