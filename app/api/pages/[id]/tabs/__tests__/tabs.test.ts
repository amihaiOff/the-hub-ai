/**
 * Integration tests for the page-tab routes:
 *   POST   /api/pages/[id]/tabs
 *   PATCH  /api/pages/[id]/tabs/[tabId]
 *   DELETE /api/pages/[id]/tabs/[tabId]
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findFirst: jest.fn(),
    },
    pageTab: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';
import { PATCH, DELETE } from '../[tabId]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const postParams = (id: string) => ({ params: Promise.resolve({ id }) });
const tabParams = (id: string, tabId: string) => ({ params: Promise.resolve({ id, tabId }) });

describe('POST /api/pages/[id]/tabs', () => {
  beforeEach(() => jest.resetAllMocks());

  function post(id: string, body: unknown) {
    return POST(
      new NextRequest(`http://localhost/api/pages/${id}/tabs`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      postParams(id)
    );
  }

  it('401s when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await post('p1', {});
    expect(res.status).toBe(401);
    expect(mockPrisma.pageTab.create).not.toHaveBeenCalled();
  });

  it('404s when the page is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await post('p1', {});
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.create).not.toHaveBeenCalled();
  });

  it('creates a tab at the end with a default title', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      _count: { tabs: 2 },
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ sortOrder: 4 });
    (mockPrisma.pageTab.create as jest.Mock).mockResolvedValueOnce({
      id: 'tab-3',
      title: 'Tab 3',
      content: null,
      sortOrder: 5,
    });
    const res = await post('p1', {});
    expect(res.status).toBe(201);
    const call = (mockPrisma.pageTab.create as jest.Mock).mock.calls[0][0];
    expect(call.data.pageId).toBe('p1');
    expect(call.data.title).toBe('Tab 3');
    expect(call.data.sortOrder).toBe(5);
  });

  it('uses sortOrder 0 for the first tab when none exist', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      _count: { tabs: 0 },
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (mockPrisma.pageTab.create as jest.Mock).mockResolvedValueOnce({
      id: 'tab-1',
      title: 'Tab 1',
      content: null,
      sortOrder: 0,
    });
    await post('p1', {});
    const call = (mockPrisma.pageTab.create as jest.Mock).mock.calls[0][0];
    expect(call.data.sortOrder).toBe(0);
    expect(call.data.title).toBe('Tab 1');
  });

  it('honours a caller-supplied title', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.page.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      _count: { tabs: 1 },
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ sortOrder: 0 });
    (mockPrisma.pageTab.create as jest.Mock).mockResolvedValueOnce({
      id: 'tab-2',
      title: 'Notes',
      content: null,
      sortOrder: 1,
    });
    await post('p1', { title: 'Notes' });
    const call = (mockPrisma.pageTab.create as jest.Mock).mock.calls[0][0];
    expect(call.data.title).toBe('Notes');
  });
});

describe('PATCH /api/pages/[id]/tabs/[tabId]', () => {
  beforeEach(() => jest.resetAllMocks());

  function patch(id: string, tabId: string, body: unknown) {
    return PATCH(
      new NextRequest(`http://localhost/api/pages/${id}/tabs/${tabId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      tabParams(id, tabId)
    );
  }

  it('404s when the tab is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await patch('p1', 't1', { title: 'New' });
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.update).not.toHaveBeenCalled();
  });

  it('only writes the keys the client sent (rename)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1', pageId: 'p1' });
    (mockPrisma.pageTab.update as jest.Mock).mockResolvedValueOnce({ id: 't1', title: 'New' });
    const res = await patch('p1', 't1', { title: 'New' });
    expect(res.status).toBe(200);
    expect(mockPrisma.pageTab.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { title: 'New' },
      select: { id: true, title: true, content: true, sortOrder: true },
    });
  });

  it('reorders via sortOrder without touching the title', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1', pageId: 'p1' });
    (mockPrisma.pageTab.update as jest.Mock).mockResolvedValueOnce({ id: 't1', sortOrder: 3 });
    await patch('p1', 't1', { sortOrder: 3 });
    expect(mockPrisma.pageTab.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { sortOrder: 3 },
      select: { id: true, title: true, content: true, sortOrder: true },
    });
  });

  it('clears content when null is sent', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1', pageId: 'p1' });
    (mockPrisma.pageTab.update as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    await patch('p1', 't1', { content: null });
    const call = (mockPrisma.pageTab.update as jest.Mock).mock.calls[0][0];
    // Prisma.JsonNull is the sentinel used to null a Json column.
    expect(call.data.content).toBeDefined();
  });
});

describe('DELETE /api/pages/[id]/tabs/[tabId]', () => {
  beforeEach(() => jest.resetAllMocks());

  function del(id: string, tabId: string) {
    return DELETE(
      new NextRequest(`http://localhost/api/pages/${id}/tabs/${tabId}`, { method: 'DELETE' }),
      tabParams(id, tabId)
    );
  }

  it('404s when the tab is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await del('p1', 't1');
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete the last remaining tab (no sibling survives the conditional delete)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1', pageId: 'p1' });
    (mockPrisma.pageTab.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    const res = await del('p1', 't1');
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/at least one tab/i);
  });

  it('deletes a tab when a sibling remains', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1', pageId: 'p1' });
    (mockPrisma.pageTab.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    const res = await del('p1', 't1');
    expect(res.status).toBe(200);
    const call = (mockPrisma.pageTab.deleteMany as jest.Mock).mock.calls[0][0];
    expect(call.where.id).toBe('t1');
    expect(call.where.pageId).toBe('p1');
    // Guard clause: only deletes when a sibling tab (id != t1) still exists.
    expect(call.where.page.tabs.some.id.not).toBe('t1');
  });
});
