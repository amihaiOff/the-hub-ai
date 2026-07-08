const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockTx = { taskCategory: { update: jest.fn() } };
const mockPrisma = {
  taskCategory: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const ctx = { activeHousehold: { id: 'hh-1' } };

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/task-categories/reorder', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => {
    await cb(mockTx);
  });
});

describe('POST /api/task-categories/reorder', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(req({ categories: [{ id: 'c1', sortOrder: 0 }] }));
    expect(res.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await POST(req({ categories: [] }));
    expect(res.status).toBe(400);
  });

  it('404 when a category id does not belong to the household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findMany.mockResolvedValue([{ id: 'c1' }]); // only one back
    const res = await POST(
      req({
        categories: [
          { id: 'c1', sortOrder: 0 },
          { id: 'c2', sortOrder: 1 },
        ],
      })
    );
    expect(res.status).toBe(404);
  });

  it('updates sortOrder atomically and returns the count', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const res = await POST(
      req({
        categories: [
          { id: 'c1', sortOrder: 0 },
          { id: 'c2', sortOrder: 1 },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated).toBe(2);
    expect(mockTx.taskCategory.update).toHaveBeenCalledTimes(2);
  });

  it('500 when the transaction throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findMany.mockResolvedValue([{ id: 'c1' }]);
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'));
    const res = await POST(req({ categories: [{ id: 'c1', sortOrder: 0 }] }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
