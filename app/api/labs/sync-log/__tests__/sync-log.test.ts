const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  moneytorSyncLog: { findMany: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { GET } from '../route';

const ctx = { activeHousehold: { id: 'hh-1' } };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/labs/sync-log', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('serialises timestamps and passes through results', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const startedAt = new Date('2026-07-01T00:00:00Z');
    const completedAt = new Date('2026-07-01T00:01:00Z');
    mockPrisma.moneytorSyncLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        source: 'manual',
        startedAt,
        completedAt,
        durationMs: 60000,
        success: true,
        errorMessage: null,
        results: { fetched: 42 },
      },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].startedAt).toBe(startedAt.toISOString());
    expect(json.data[0].completedAt).toBe(completedAt.toISOString());
    expect(json.data[0].results.fetched).toBe(42);
  });

  it('returns empty array when the household has no logs', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorSyncLog.findMany.mockResolvedValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});
