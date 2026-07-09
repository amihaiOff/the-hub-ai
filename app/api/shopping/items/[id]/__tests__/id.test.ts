/**
 * Integration tests for /api/shopping/items/[id] (PUT + DELETE).
 */

import { NextRequest } from 'next/server';

// Mocks must be declared before importing the route.
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingItem: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingCategory: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { PUT, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const routeParams = { params: Promise.resolve({ id: 'item-1' }) };

const putRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/shopping/items/item-1', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('PUT /api/shopping/items/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PUT(putRequest({ name: 'Milk' }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns 400 on invalid payload', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    // warningDays must be >= 1
    const res = await PUT(putRequest({ warningDays: 0 }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 404 when item does not belong to household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PUT(putRequest({ name: 'Milk' }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Item not found');
  });

  it('returns 404 when provided category does not belong to household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await PUT(putRequest({ categoryId: 'cat-bad' }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Category not found');
  });

  it('updates all provided fields and verifies category ownership', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({
      id: 'cat-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.update as jest.Mock).mockResolvedValue({
      id: 'item-1',
      name: 'Milk',
      nameHe: 'חלב',
      categoryId: 'cat-1',
      isDefault: true,
      lastPurchasedAt: new Date('2026-06-01T00:00:00.000Z'),
      warningDays: 7,
      category: { id: 'cat-1', name: 'Dairy' },
    });

    const res = await PUT(
      putRequest({
        name: 'Milk',
        nameHe: 'חלב',
        categoryId: 'cat-1',
        isDefault: true,
        warningDays: 7,
      }),
      routeParams
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.shoppingCategory.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat-1', householdId: 'hh-1' },
    });
    const updateCall = (mockPrisma.shoppingItem.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'item-1' });
    expect(updateCall.data).toEqual({
      name: 'Milk',
      nameHe: 'חלב',
      categoryId: 'cat-1',
      isDefault: true,
      warningDays: 7,
    });
    expect(data.data).toMatchObject({
      id: 'item-1',
      name: 'Milk',
      categoryName: 'Dairy',
      lastPurchasedAt: '2026-06-01T00:00:00.000Z',
      warningDays: 7,
    });
  });

  it('updates without touching category when categoryId absent, and returns null lastPurchasedAt', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.update as jest.Mock).mockResolvedValue({
      id: 'item-1',
      name: 'Bread',
      nameHe: null,
      categoryId: 'cat-9',
      isDefault: false,
      lastPurchasedAt: null,
      warningDays: null,
      category: { id: 'cat-9', name: 'Bakery' },
    });

    const res = await PUT(putRequest({ name: 'Bread' }), routeParams);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.shoppingCategory.findFirst).not.toHaveBeenCalled();
    const updateCall = (mockPrisma.shoppingItem.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).toEqual({ name: 'Bread' });
    expect(data.data.lastPurchasedAt).toBeNull();
  });

  it('returns 400 on unique constraint violation', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.update as jest.Mock).mockRejectedValue(
      new Error('Unique constraint failed on the constraint: `name`')
    );
    const res = await PUT(putRequest({ name: 'Milk' }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('An item with this name already exists');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.update as jest.Mock).mockRejectedValue(new Error('Connection lost'));
    const res = await PUT(putRequest({ name: 'Milk' }), routeParams);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to update shopping item');
  });
});

describe('DELETE /api/shopping/items/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  const deleteRequest = () =>
    new NextRequest('http://localhost/api/shopping/items/item-1', { method: 'DELETE' });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), routeParams);
    expect(res.status).toBe(401);
  });

  it('returns 404 when item not found', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), routeParams);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Item not found');
  });

  it('deletes the item successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.delete as jest.Mock).mockResolvedValue({ id: 'item-1' });
    const res = await DELETE(deleteRequest(), routeParams);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('item-1');
    expect(mockPrisma.shoppingItem.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('returns 500 on database error', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
      id: 'item-1',
      householdId: 'hh-1',
    });
    (mockPrisma.shoppingItem.delete as jest.Mock).mockRejectedValue(new Error('Database error'));
    const res = await DELETE(deleteRequest(), routeParams);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to delete shopping item');
  });
});
