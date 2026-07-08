const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  generalLog: {
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { GET } from '../route';
import { POST as MARK_READ } from '../mark-read/route';
import { GET as UNREAD } from '../unread-count/route';

const ctx = { activeHousehold: { id: 'hh-1' } };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/labs/general-log', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('serialises entries with ISO timestamps and includes unreadCount', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const createdAt = new Date('2026-07-01T00:00:00Z');
    const readAt = new Date('2026-07-02T00:00:00Z');
    mockPrisma.generalLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        type: 'rename',
        subjectType: 'account',
        subjectId: 'row-1',
        oldValue: 'Old',
        newValue: 'New',
        description: null,
        readAt,
        createdAt,
      },
      {
        id: 'log-2',
        type: 'hard_delete',
        subjectType: 'account',
        subjectId: 'row-2',
        oldValue: 'Gone',
        newValue: null,
        description: null,
        readAt: null,
        createdAt,
      },
    ]);
    mockPrisma.generalLog.count.mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.unreadCount).toBe(3);
    expect(json.data.entries).toHaveLength(2);
    expect(json.data.entries[0].readAt).toBe(readAt.toISOString());
    expect(json.data.entries[0].createdAt).toBe(createdAt.toISOString());
    expect(json.data.entries[1].readAt).toBeNull();
  });
});

describe('GET /api/labs/general-log/unread-count', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await UNREAD();
    expect(res.status).toBe(401);
  });

  it('returns the count from prisma', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.generalLog.count.mockResolvedValue(7);
    const res = await UNREAD();
    const json = await res.json();
    expect(json.data.unreadCount).toBe(7);
  });
});

describe('POST /api/labs/general-log/mark-read', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await MARK_READ();
    expect(res.status).toBe(401);
  });

  it('marks unread entries as read and returns the count', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.generalLog.updateMany.mockResolvedValue({ count: 4 });
    const res = await MARK_READ();
    const json = await res.json();
    expect(json.data.markedRead).toBe(4);
    expect(mockPrisma.generalLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { householdId: 'hh-1', readAt: null },
      })
    );
  });
});
