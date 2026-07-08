const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  taskCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const ctx = { activeHousehold: { id: 'hh-1' } };

function jsonReq(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/task-categories', {
    method,
    body: JSON.stringify(body),
  });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/task-categories', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns categories for the active household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findMany.mockResolvedValue([
      { id: 'c1', name: 'Work' },
      { id: 'c2', name: 'Home' },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(mockPrisma.taskCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: 'hh-1' } })
    );
  });
});

describe('POST /api/task-categories', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await POST(jsonReq({ name: 'x' }));
    expect(res.status).toBe(401);
  });

  it('400 on schema failure', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('creates a category and returns 201', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.create.mockResolvedValue({ id: 'c1', name: 'Work' });
    const res = await POST(jsonReq({ name: 'Work', color: '#3b82f6' }));
    expect(res.status).toBe(201);
  });

  it('409 on Prisma P2002 unique-violation', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.create.mockRejectedValue({ code: 'P2002' });
    const res = await POST(jsonReq({ name: 'Work' }));
    expect(res.status).toBe(409);
  });

  it('500 on other DB errors', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.create.mockRejectedValue(new Error('boom'));
    const res = await POST(jsonReq({ name: 'Work' }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('PATCH /api/task-categories/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PATCH(jsonReq({ name: 'x' }, 'PATCH'), params('c1'));
    expect(res.status).toBe(401);
  });

  it('400 on schema failure', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await PATCH(jsonReq({ name: '' }, 'PATCH'), params('c1'));
    expect(res.status).toBe(400);
  });

  it('404 when the category is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue(null);
    const res = await PATCH(jsonReq({ name: 'x' }, 'PATCH'), params('c1'));
    expect(res.status).toBe(404);
  });

  it('updates and returns the row', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue({ id: 'c1' });
    mockPrisma.taskCategory.update.mockResolvedValue({ id: 'c1', name: 'New' });
    const res = await PATCH(jsonReq({ name: 'New' }, 'PATCH'), params('c1'));
    expect(res.status).toBe(200);
  });

  it('500 on update failure', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue({ id: 'c1' });
    mockPrisma.taskCategory.update.mockRejectedValue(new Error('x'));
    const res = await PATCH(jsonReq({ name: 'y' }, 'PATCH'), params('c1'));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('DELETE /api/task-categories/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await DELETE(jsonReq({}, 'DELETE'), params('c1'));
    expect(res.status).toBe(401);
  });

  it('404 when the category is missing', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue(null);
    const res = await DELETE(jsonReq({}, 'DELETE'), params('c1'));
    expect(res.status).toBe(404);
  });

  it('deletes and returns success', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue({ id: 'c1' });
    mockPrisma.taskCategory.delete.mockResolvedValue({});
    const res = await DELETE(jsonReq({}, 'DELETE'), params('c1'));
    expect(res.status).toBe(200);
  });

  it('500 on delete failure', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.taskCategory.findFirst.mockResolvedValue({ id: 'c1' });
    mockPrisma.taskCategory.delete.mockRejectedValue(new Error('x'));
    const res = await DELETE(jsonReq({}, 'DELETE'), params('c1'));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
