/**
 * Integration tests for GET /api/agent/backlog (API-key auth + extraction).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: { page: { findMany: jest.fn() } },
}));

jest.mock('@/lib/auth-api-key', () => ({
  getHouseholdIdFromAgentKey: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getHouseholdIdFromAgentKey } from '@/lib/auth-api-key';
import { GET } from '../route';

const mockAuth = getHouseholdIdFromAgentKey as jest.MockedFunction<
  typeof getHouseholdIdFromAgentKey
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const req = () => new NextRequest('http://localhost/api/agent/backlog');

const COLS = [
  { id: 'c_name', name: 'Name', type: 'text' },
  { id: 'c_claude', name: 'for Claude', type: 'checkbox' },
];

describe('GET /api/agent/backlog', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s without a valid API key', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockPrisma.page.findMany).not.toHaveBeenCalled();
  });

  it('returns the flagged rows for the authenticated household', async () => {
    mockAuth.mockResolvedValueOnce('hh-1');
    // Content lives on the page's tabs, not `Page.content`.
    (mockPrisma.page.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Roadmap',
        tabs: [
          {
            content: {
              type: 'doc',
              content: [
                {
                  type: 'databaseBlock',
                  attrs: {
                    columns: COLS,
                    rows: [
                      { id: 'r1', cells: { c_name: 'Do X', c_claude: true } },
                      { id: 'r2', cells: { c_name: 'Skip', c_claude: false } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.count).toBe(1);
    expect(json.data.tasks[0]).toMatchObject({ title: 'Do X', pageId: 'p1', pageTitle: 'Roadmap' });
    // Query is scoped to the authenticated household.
    expect(mockPrisma.page.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: 'hh-1' } })
    );
  });
});
