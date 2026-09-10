/**
 * Integration tests for POST /api/pages/[id]/ops — the structured page-write
 * endpoint.
 *
 * What these cover: wiring (auth, tab selection, status codes, the
 * compare-and-swap write). The instruction vocabulary's own semantics live in
 * `lib/pages/__tests__/page-ops.test.ts` and are not repeated here.
 *
 * Auth note: unlike the neighbouring page-route tests, this file does NOT mock
 * `@/lib/auth-pages` — it mocks the two things `resolvePagesAccess` reads
 * (`getCurrentContext` and the scoped-token resolvers) and lets the real
 * resolver run. Mocking the resolver itself makes "401 when unauthenticated"
 * pass for the wrong reason: with the mock reset per test an unstubbed resolver
 * returns `undefined`, so the route 401s no matter which auth path it consults.
 * Here the token path is a real, separately-stubbed path, so the 401 assertions
 * mean something and the token-only request genuinely authenticates.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findFirst: jest.fn(),
    },
    pageTab: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/auth-api-key', () => ({
  getPagesHouseholdIdFromToken: jest.fn(),
  resolveHouseholdOwnerUserId: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { getPagesHouseholdIdFromToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockTokenHousehold = getPagesHouseholdIdFromToken as jest.MockedFunction<
  typeof getPagesHouseholdIdFromToken
>;
const mockOwnerUser = resolveHouseholdOwnerUserId as jest.MockedFunction<
  typeof resolveHouseholdOwnerUserId
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const READ_AT = new Date('2026-09-01T10:00:00.000Z');
const SAVED_AT = new Date('2026-09-01T10:05:00.000Z');

/** A stored document with something already on the page. */
const existingDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'already here' }] }],
};

/** A stored document holding one table, so addRows/setCells have a target. */
const STATUS_OPTION = { id: 'opt_done', label: 'Done' };
const docWithTable = {
  type: 'doc',
  content: [
    {
      type: 'databaseBlock',
      attrs: {
        id: 'dbb_1',
        title: 'Inbox',
        columns: [
          { id: 'col_title', name: 'Title', type: 'text' },
          { id: 'col_status', name: 'Status', type: 'select', options: [STATUS_OPTION] },
        ],
        rows: [{ id: 'row_1', cells: { col_title: 'Buy milk', col_status: null } }],
      },
    },
  ],
};

/** A page whose tabs come back in sortOrder order, as the route's query asks. */
function pageWithTabs(
  tabs: Array<{ id: string; content: unknown; updatedAt?: Date }> = [{ id: 'tab-1', content: null }]
) {
  return {
    id: 'p1',
    tabs: tabs.map((t) => ({ ...t, updatedAt: t.updatedAt ?? READ_AT })),
  };
}

/** Signed in as a real user in household hh-1. */
function withSession() {
  mockGetCurrentContext.mockResolvedValue(mockContext);
}

/** No session at all — only the scoped `AGENT_PAGES_TOKEN` path. */
function withTokenOnly() {
  mockGetCurrentContext.mockResolvedValue(null);
  mockTokenHousehold.mockResolvedValue('hh-1');
  mockOwnerUser.mockResolvedValue('user-1');
}

/**
 * `ifUnchangedSince` is required by the endpoint (it is what makes a retried
 * write safe), so it is supplied here as the stamp the caller "just read"
 * unless a test sets its own — the concurrency tests below override it, and
 * `postRaw` sends a body through untouched.
 */
function post(id: string, body: unknown, headers?: Record<string, string>) {
  const withStamp =
    body && typeof body === 'object' && !Array.isArray(body) && !('ifUnchangedSince' in body)
      ? { ifUnchangedSince: READ_AT.toISOString(), ...body }
      : body;
  return postRaw(id, withStamp, headers);
}

/** Sends exactly the body given — nothing added. */
function postRaw(id: string, body: unknown, headers?: Record<string, string>) {
  return POST(
    new NextRequest(`http://localhost/api/pages/${id}/ops`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** The document handed to `updateMany` — what actually gets persisted. */
function persistedContent() {
  const call = (mockPrisma.pageTab.updateMany as jest.Mock).mock.calls[0][0];
  return call.data.content;
}

const paragraphOp = { op: 'appendParagraph', text: 'from the agent' };

beforeEach(() => {
  jest.resetAllMocks();
  (mockPrisma.pageTab.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (mockPrisma.pageTab.findUnique as jest.Mock).mockResolvedValue({ updatedAt: SAVED_AT });
});

describe('POST /api/pages/[id]/ops — authentication', () => {
  it('401s when there is neither a session nor a valid token', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    mockTokenHousehold.mockResolvedValue(null);

    const res = await post('p1', { ops: [paragraphOp] });

    expect(res.status).toBe(401);
    expect(mockPrisma.page.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('writes with no session at all when the scoped token is the only credential', async () => {
    // The counterpart to the 401 above: same absent session, valid token, and
    // the write lands. Proves the 401 is about credentials, not a dead route.
    withTokenOnly();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    const res = await post('p1', { ops: [paragraphOp] }, { authorization: 'Bearer pages-token' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockPrisma.pageTab.updateMany).toHaveBeenCalledTimes(1);
    // Scoped to the token's household, not a session's active household.
    expect(mockPrisma.page.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', householdId: 'hh-1' } })
    );
  });

  it('401s when the token names a household with no owner user to act as', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    mockTokenHousehold.mockResolvedValue('hh-orphan');
    mockOwnerUser.mockResolvedValue(null);

    const res = await post('p1', { ops: [paragraphOp] }, { authorization: 'Bearer pages-token' });

    expect(res.status).toBe(401);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('prefers the session household when a session exists', async () => {
    withSession();
    mockTokenHousehold.mockResolvedValue('hh-other');
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    await post('p1', { ops: [paragraphOp] });

    expect(mockPrisma.page.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', householdId: 'hh-1' } })
    );
    expect(mockTokenHousehold).not.toHaveBeenCalled();
  });
});

describe('POST /api/pages/[id]/ops — finding the page and tab', () => {
  it('404s when the page id is not in the caller household', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await post('p-nope', { ops: [paragraphOp] });

    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('404s for a tabId that is not on the page', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    const res = await post('p1', { tabId: 'tab-nope', ops: [paragraphOp] });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/tab not found/i);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('404s when the page somehow has no tabs to write into', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs([]));

    const res = await post('p1', { ops: [paragraphOp] });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/no tabs/i);
  });

  it('writes to the first tab by sortOrder when no tabId is given', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([
        { id: 'tab-first', content: null },
        { id: 'tab-second', content: null },
      ])
    );

    const res = await post('p1', { ops: [paragraphOp] });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.tabId).toBe('tab-first');
    // The tab order the default depends on is asked for in the query itself.
    expect(mockPrisma.page.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          tabs: expect.objectContaining({ orderBy: { sortOrder: 'asc' } }),
        }),
      })
    );
    expect((mockPrisma.pageTab.updateMany as jest.Mock).mock.calls[0][0].where.id).toBe(
      'tab-first'
    );
  });

  it('writes to the named tab when a tabId is given', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([
        { id: 'tab-first', content: null },
        { id: 'tab-second', content: existingDoc },
      ])
    );

    const res = await post('p1', { tabId: 'tab-second', ops: [paragraphOp] });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.tabId).toBe('tab-second');
    expect((mockPrisma.pageTab.updateMany as jest.Mock).mock.calls[0][0].where.id).toBe(
      'tab-second'
    );
    // ...and it appended to that tab's document, not the first tab's.
    expect(persistedContent().content[0]).toEqual(existingDoc.content[0]);
  });
});

describe('POST /api/pages/[id]/ops — rejecting bad instructions', () => {
  it('400s with a message when the body is not a list of instructions', async () => {
    withSession();

    const res = await post('p1', { ops: [] });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
    expect(mockPrisma.page.findFirst).not.toHaveBeenCalled();
  });

  it('400s on an instruction that is not one we offer', async () => {
    withSession();

    const res = await post('p1', { ops: [{ op: 'dropTable', text: 'x' }] });

    expect(res.status).toBe(400);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('400s on a malformed instruction of a known kind (heading level 5)', async () => {
    withSession();

    const res = await post('p1', { ops: [{ op: 'appendHeading', level: 5, text: 'Nope' }] });

    expect(res.status).toBe(400);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('400s with the failing op index when a column name is not on the table', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([{ id: 'tab-1', content: docWithTable }])
    );

    const res = await post('p1', {
      ops: [paragraphOp, { op: 'addRows', rows: [{ Nonexistent: 'x' }] }],
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no column "Nonexistent"/);
    expect(json.data.opIndex).toBe(1);
    // All-or-nothing: the valid paragraph in the same batch is not persisted.
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('400s when a choice value is not one of the column options', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([{ id: 'tab-1', content: docWithTable }])
    );

    const res = await post('p1', {
      ops: [{ op: 'setCells', rowId: 'row_1', values: { Status: 'Elsewhere' } }],
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/not a choice in "Status"/);
    expect(json.data.opIndex).toBe(0);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('400s when a batch of valid instructions would blow the content size cap', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    // Each piece is within its own limit; together they exceed the whole-page
    // cap, which is the branch under test.
    const res = await post('p1', {
      ops: Array(50).fill({
        op: 'appendBulletList',
        items: Array(100).fill('x'.repeat(2_000)),
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too large/i);
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/pages/[id]/ops — concurrency', () => {
  it('409s before writing when ifUnchangedSince does not match the tab stamp', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    const res = await post('p1', {
      ifUnchangedSince: '2026-08-01T00:00:00.000Z',
      ops: [paragraphOp],
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/changed since you read it/i);
    // The current stamp comes back so the caller can re-read and retry.
    expect(json.data).toEqual({ tabId: 'tab-1', updatedAt: READ_AT.toISOString() });
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('proceeds when ifUnchangedSince matches the tab stamp', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    const res = await post('p1', {
      ifUnchangedSince: READ_AT.toISOString(),
      ops: [paragraphOp],
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.pageTab.updateMany).toHaveBeenCalledTimes(1);
  });

  it('409s when the compare-and-swap loses to a save that landed first', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());
    (mockPrisma.pageTab.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.pageTab.findUnique as jest.Mock).mockResolvedValue({ updatedAt: SAVED_AT });

    const res = await post('p1', { ops: [paragraphOp] });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/changed while this write was being applied/i);
    expect(json.data).toEqual({ tabId: 'tab-1', updatedAt: SAVED_AT.toISOString() });
  });

  it('puts the stamp it read into the update WHERE so a racing save is not clobbered', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    await post('p1', { ops: [paragraphOp] });

    expect((mockPrisma.pageTab.updateMany as jest.Mock).mock.calls[0][0].where).toEqual({
      id: 'tab-1',
      updatedAt: READ_AT,
    });
  });
});

describe('POST /api/pages/[id]/ops — the successful write', () => {
  it('returns the tab, its new stamp, and the handles the batch created', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());

    const res = await post('p1', {
      ops: [
        {
          op: 'addDatabaseBlock',
          title: 'Inbox',
          columns: [{ name: 'Title', type: 'text' }],
        },
        { op: 'addRows', rows: [{ Title: 'Buy milk' }, { Title: 'Call bank' }] },
      ],
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.tabId).toBe('tab-1');
    expect(json.data.updatedAt).toBe(SAVED_AT.toISOString());
    expect(json.data.outcomes).toHaveLength(2);
    expect(json.data.outcomes[0].blockId).toMatch(/^dbb_/);
    expect(json.data.outcomes[1].rowIds).toHaveLength(2);

    // The handles it handed back address the table it actually persisted.
    const block = persistedContent().content[0];
    expect(block.attrs.id).toBe(json.data.outcomes[0].blockId);
    expect(block.attrs.rows.map((r: { id: string }) => r.id)).toEqual(json.data.outcomes[1].rowIds);
  });

  it('persists a well-formed document that keeps existing content and appends to it', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([{ id: 'tab-1', content: existingDoc }])
    );

    const res = await post('p1', {
      ops: [
        { op: 'appendHeading', level: 2, text: 'Tuesday' },
        { op: 'appendBulletList', items: ['milk', 'bread'] },
      ],
    });

    expect(res.status).toBe(200);
    const content = persistedContent();
    expect(content.type).toBe('doc');
    expect(content.content).toEqual([
      // Pre-existing content survives, unchanged and still first.
      { type: 'paragraph', content: [{ type: 'text', text: 'already here' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tuesday' }] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'milk' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bread' }] }],
          },
        ],
      },
    ]);
  });

  it('updates cells on an existing row in place', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(
      pageWithTabs([{ id: 'tab-1', content: docWithTable }])
    );

    const res = await post('p1', {
      ops: [{ op: 'setCells', blockId: 'dbb_1', rowId: 'row_1', values: { Status: 'Done' } }],
    });

    expect(res.status).toBe(200);
    const rows = persistedContent().content[0].attrs.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual({ col_title: 'Buy milk', col_status: 'opt_done' });
  });

  it('500s without persisting anything when the database write throws', async () => {
    withSession();
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValue(pageWithTabs());
    (mockPrisma.pageTab.updateMany as jest.Mock).mockRejectedValue(new Error('connection lost'));

    const res = await post('p1', { ops: [paragraphOp] });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe('the safety stamp is not optional', () => {
  it('refuses a write that does not say what it last read', async () => {
    withSession();
    const response = await postRaw('page-1', { ops: [paragraphOp] });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('ifUnchangedSince');
    expect(mockPrisma.pageTab.updateMany).not.toHaveBeenCalled();
  });

  it('answers a garbled body with a bad-request, not a server error', async () => {
    withSession();
    const response = await postRaw('page-1', 'not json at all{');

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('JSON');
  });

  it('says which instruction and field was wrong', async () => {
    withSession();
    const response = await post('page-1', {
      ops: [paragraphOp, { op: 'appendHeading', level: 9, text: 'x' }],
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('ops.1');
  });
});
