/**
 * Integration tests for /api/share/[token]/tabs/[tabId] (PATCH) — content
 * edits for a page shared with access: 'edit'. No session, no delete/create,
 * refuses outright on a view-only share.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    page: {
      findUnique: jest.fn(),
    },
    pageTab: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { PATCH } from '../route';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const params = (token: string, tabId: string) => ({ params: Promise.resolve({ token, tabId }) });

function patch(token: string, tabId: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/share/${token}/tabs/${tabId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    params(token, tabId)
  );
}

describe('PATCH /api/share/[token]/tabs/[tabId]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('404s on an unknown token', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await patch('nope', 't1', { content: {} });
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.update).not.toHaveBeenCalled();
  });

  it('403s when the share is view-only', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareAccess: 'view',
    });
    const res = await patch('tok', 't1', { content: {} });
    expect(res.status).toBe(403);
    expect(mockPrisma.pageTab.update).not.toHaveBeenCalled();
  });

  it("404s when the tab doesn't belong to the shared page", async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareAccess: 'edit',
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await patch('tok', 'not-this-page-tab', { content: {} });
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.findFirst).toHaveBeenCalledWith({
      where: { id: 'not-this-page-tab', pageId: 'p1' },
      select: { id: true },
    });
  });

  it('404s on a tabId that exists but belongs to a DIFFERENT page than the one the token resolves to', async () => {
    // The token resolves to page 'p1'. tabId 't-from-p2' is a real tab, but it
    // lives on a different page ('p2') — the pageId-scoped lookup must miss it,
    // exactly as if the DB has: page p1 { tabs: [t-from-p1] }, page p2 { tabs:
    // [t-from-p2] }, and someone swaps in p2's tabId against p1's share token.
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareAccess: 'edit',
    });
    // findFirst is scoped by { id: tabId, pageId: page.id } — a tab that is
    // real but owned by p2 does not match that compound where, so Prisma
    // (correctly modeled here) returns null rather than the p2 tab.
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await patch('tok', 't-from-p2', { content: { type: 'doc' } });
    expect(res.status).toBe(404);
    expect(mockPrisma.pageTab.findFirst).toHaveBeenCalledWith({
      where: { id: 't-from-p2', pageId: 'p1' },
      select: { id: true },
    });
    expect(mockPrisma.pageTab.update).not.toHaveBeenCalled();
  });

  it('updates content on an edit-access share', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareAccess: 'edit',
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    (mockPrisma.pageTab.update as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      title: '',
      content: { type: 'doc' },
      sortOrder: 0,
      updatedAt: new Date(),
    });
    const res = await patch('tok', 't1', { content: { type: 'doc' } });
    expect(res.status).toBe(200);
    expect(mockPrisma.pageTab.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { content: { type: 'doc' } },
      select: { id: true, title: true, content: true, sortOrder: true, updatedAt: true },
    });
  });

  it('rejects an oversized content payload the same way the authed route would', async () => {
    (mockPrisma.page.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'p1',
      shareAccess: 'edit',
    });
    (mockPrisma.pageTab.findFirst as jest.Mock).mockResolvedValueOnce({ id: 't1' });
    const res = await patch('tok', 't1', { content: { blob: 'x'.repeat(2_000_000) } });
    expect(res.status).toBe(400);
    expect(mockPrisma.pageTab.update).not.toHaveBeenCalled();
  });
});
