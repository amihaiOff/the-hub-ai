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

  describe('response slimming', () => {
    const respond = (body: unknown, status = 200) =>
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    const toolText = async (res: Response) => {
      const body = await res.json();
      return { result: body.result, text: body.result.content[0].text as string };
    };

    const tasks = [
      {
        id: 't1',
        title: 'Open task',
        done: false,
        priority: 'high',
        color: '#fff',
        createdAt: '2026-01-01T00:00:00Z',
        category: { id: 'c1', name: 'Home', color: '#000' },
        children: [{ id: 's1', title: 'Sub', done: true, createdAt: 'x' }],
      },
      { id: 't2', title: 'Done task', done: true, priority: 'low' },
      {
        id: 't3',
        title: 'Done parent, open child',
        done: true,
        children: [{ id: 's3', title: 'Still open', done: false }],
      },
    ];

    it('list_tasks drops done tasks by default and slims each task', async () => {
      respond({ success: true, data: tasks });
      const { result, text } = await toolText(await POST(callTool('list_tasks', {})));
      expect(result.isError).toBe(false);
      const json = JSON.parse(text);
      expect(json.success).toBe(true);
      expect(json.data).toEqual([
        {
          id: 't1',
          title: 'Open task',
          done: false,
          priority: 'high',
          category: { id: 'c1', name: 'Home' },
          subtasks: [{ id: 's1', title: 'Sub', done: true }],
        },
        {
          id: 't3',
          title: 'Done parent, open child',
          done: true,
          subtasks: [{ id: 's3', title: 'Still open', done: false }],
        },
      ]);
      expect(json.data.map((t: { id: string }) => t.id)).not.toContain('t2');
    });

    it('list_tasks keeps done tasks with includeDone and does not forward it as a query param', async () => {
      respond({ success: true, data: tasks });
      const { text } = await toolText(
        await POST(callTool('list_tasks', { includeDone: true, search: 'x' }))
      );
      expect(JSON.parse(text).data.map((t: { id: string }) => t.id)).toEqual(['t1', 't2', 't3']);
      const url = new URL(String(fetchMock.mock.calls[0][0]));
      expect(url.pathname).toBe('/api/tasks');
      expect(url.searchParams.get('search')).toBe('x');
      expect(url.searchParams.has('includeDone')).toBe(false);
    });

    const summary = {
      month: '2026-10',
      totalIncome: 1000.5,
      dailySpent: [{ day: 1, amount: 10 }],
      categoryGroups: [
        {
          id: 'g1',
          name: 'Food',
          categories: [
            { id: 'c1', name: 'Groceries', spent: 0.3, transactions: [{ id: 'x1' }, { id: 'x2' }] },
            { id: 'c2', name: 'Dining', spent: 0 },
          ],
        },
      ],
    };

    it('get_budget_summary slims by default', async () => {
      respond({ success: true, data: summary });
      const { text } = await toolText(
        await POST(callTool('get_budget_summary', { month: '2026-10' }))
      );
      const data = JSON.parse(text).data;
      expect(data.dailySpent).toBeUndefined();
      expect(data.totalIncome).toBe(1000.5);
      expect(data.categoryGroups[0].categories).toEqual([
        { id: 'c1', name: 'Groceries', spent: 0.3, transactionCount: 2 },
        { id: 'c2', name: 'Dining', spent: 0, transactionCount: 0 },
      ]);
    });

    it('get_budget_summary returns the raw response with includeTransactions (not forwarded)', async () => {
      respond({ success: true, data: summary });
      const { text } = await toolText(
        await POST(callTool('get_budget_summary', { month: '2026-10', includeTransactions: true }))
      );
      expect(JSON.parse(text)).toEqual({ success: true, data: summary });
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'http://localhost:3001/api/budget/summary?month=2026-10'
      );
    });

    it.each([
      ['list_tasks', {}],
      ['get_budget_summary', { month: '2026-10' }],
    ])('%s passes an error response through unchanged', async (name, args) => {
      const errBody = { success: false, error: 'boom', data: [{ id: 'z', done: true }] };
      respond(errBody, 500);
      const { result, text } = await toolText(await POST(callTool(name, args)));
      expect(result.isError).toBe(true);
      expect(text).toBe(`HTTP 500: ${JSON.stringify(errBody)}`);
    });

    it('list_tasks passes a non-JSON success body through unchanged', async () => {
      fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
      const { result, text } = await toolText(await POST(callTool('list_tasks', {})));
      expect(result.isError).toBe(false);
      expect(text).toBe('not json');
    });
  });

  it('call_app_action refuses paths that are not catalog actions', async () => {
    const res = await POST(callTool('call_app_action', { method: 'GET', path: '/api/backup' }));
    const body = await res.json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.result.isError).toBe(true);
  });
});
