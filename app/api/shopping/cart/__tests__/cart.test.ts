/**
 * Integration tests for /api/shopping/cart routes
 * Tests cart CRUD: listing, adding/upserting, clearing checked, updating, and removing items.
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingCartItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    shoppingItem: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST, DELETE } from '../route';
import { PUT, DELETE as DELETE_BY_ID } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Shopping Cart API', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      userId: 'user-1',
    },
    households: [
      { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
    ],
    activeHousehold: {
      id: 'household-1',
      name: 'Test Household',
      description: null,
      role: 'owner' as const,
    },
    householdProfiles: [
      {
        id: 'profile-1',
        name: 'Test Profile',
        image: null,
        color: null,
        role: 'owner' as const,
        hasUser: true,
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ==========================================
  // GET /api/shopping/cart
  // ==========================================

  describe('GET /api/shopping/cart', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return cart items with item and category info', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const mockCartItems = [
        {
          id: 'cart-1',
          itemId: 'item-1',
          quantity: 2,
          checked: false,
          householdId: 'household-1',
          item: {
            name: 'Milk',
            category: { id: 'cat-1', name: 'Dairy', sortOrder: 0 },
          },
        },
        {
          id: 'cart-2',
          itemId: 'item-2',
          quantity: 1,
          checked: true,
          householdId: 'household-1',
          item: {
            name: 'Bread',
            category: { id: 'cat-2', name: 'Dry Goods', sortOrder: 1 },
          },
        },
      ];

      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue(mockCartItems);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]).toEqual({
        id: 'cart-1',
        itemId: 'item-1',
        itemName: 'Milk',
        categoryId: 'cat-1',
        categoryName: 'Dairy',
        quantity: 2,
        checked: false,
      });
      expect(data.data[1]).toEqual({
        id: 'cart-2',
        itemId: 'item-2',
        itemName: 'Bread',
        categoryId: 'cat-2',
        categoryName: 'Dry Goods',
        quantity: 1,
        checked: true,
      });
    });

    it('should return empty array when cart is empty', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch shopping cart');
    });
  });

  // ==========================================
  // POST /api/shopping/cart
  // ==========================================

  describe('POST /api/shopping/cart', () => {
    const createRequest = (body: Record<string, unknown>) =>
      new NextRequest('http://localhost:3001/api/shopping/cart', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await POST(createRequest({ itemId: 'item-1' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing itemId', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when item does not belong to household', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest({ itemId: 'item-nonexistent' }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Item not found');
    });

    it('should add item to cart with default quantity 1', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'item-1',
        name: 'Milk',
        householdId: 'household-1',
      });

      // Item not in cart yet
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue(null);

      const createResult = {
        id: 'cart-1',
        itemId: 'item-1',
        quantity: 1,
        checked: false,
        householdId: 'household-1',
        item: {
          name: 'Milk',
          category: { id: 'cat-1', name: 'Dairy' },
        },
      };
      (mockPrisma.shoppingCartItem.create as jest.Mock).mockResolvedValue(createResult);

      const response = await POST(createRequest({ itemId: 'item-1' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({
        id: 'cart-1',
        itemId: 'item-1',
        itemName: 'Milk',
        categoryId: 'cat-1',
        categoryName: 'Dairy',
        quantity: 1,
        checked: false,
      });

      expect(mockPrisma.shoppingCartItem.create).toHaveBeenCalled();
    });

    it('should add item to cart with custom quantity', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'item-1',
        name: 'Eggs',
        householdId: 'household-1',
      });

      // Item not in cart yet
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue(null);

      const createResult = {
        id: 'cart-1',
        itemId: 'item-1',
        quantity: 3,
        checked: false,
        householdId: 'household-1',
        item: {
          name: 'Eggs',
          category: { id: 'cat-1', name: 'Dairy' },
        },
      };
      (mockPrisma.shoppingCartItem.create as jest.Mock).mockResolvedValue(createResult);

      const response = await POST(createRequest({ itemId: 'item-1', quantity: 3 }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.quantity).toBe(3);

      expect(mockPrisma.shoppingCartItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: 3 }),
        })
      );
    });

    it('should return 400 for invalid quantity (zero)', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({ itemId: 'item-1', quantity: 0 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid quantity (negative)', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({ itemId: 'item-1', quantity: -1 }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'item-1',
        name: 'Milk',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await POST(createRequest({ itemId: 'item-1' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to add item to cart');
    });
  });

  // ==========================================
  // DELETE /api/shopping/cart (clear checked)
  // ==========================================

  describe('DELETE /api/shopping/cart', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should clear all checked items and return count', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([
        { id: 'ci-1' },
        { id: 'ci-2' },
        { id: 'ci-3' },
      ]);
      (mockPrisma.shoppingCartItem.delete as jest.Mock).mockResolvedValue({});

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deletedCount).toBe(3);
      expect(mockPrisma.shoppingCartItem.delete).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no checked items exist', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([]);

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deletedCount).toBe(0);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await DELETE();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to clear checked items');
    });
  });

  // ==========================================
  // PUT /api/shopping/cart/[id]
  // ==========================================

  describe('PUT /api/shopping/cart/[id]', () => {
    const createPutRequest = (body: Record<string, unknown>) =>
      new NextRequest('http://localhost:3001/api/shopping/cart/cart-1', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

    const routeParams = { params: Promise.resolve({ id: 'cart-1' }) };

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await PUT(createPutRequest({ checked: true }), routeParams);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 404 when cart item not found', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await PUT(createPutRequest({ checked: true }), routeParams);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cart item not found');
    });

    it('should return 400 when neither checked nor quantity provided', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });

      const response = await PUT(createPutRequest({}), routeParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should toggle checked status', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });

      const updateResult = {
        id: 'cart-1',
        itemId: 'item-1',
        quantity: 1,
        checked: true,
        householdId: 'household-1',
        item: {
          name: 'Milk',
          category: { id: 'cat-1', name: 'Dairy' },
        },
      };
      (mockPrisma.shoppingCartItem.update as jest.Mock).mockResolvedValue(updateResult);

      const response = await PUT(createPutRequest({ checked: true }), routeParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.checked).toBe(true);
      expect(mockPrisma.shoppingCartItem.update).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: { checked: true },
        include: {
          item: {
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });
    });

    it('should update quantity', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });

      const updateResult = {
        id: 'cart-1',
        itemId: 'item-1',
        quantity: 5,
        checked: false,
        householdId: 'household-1',
        item: {
          name: 'Milk',
          category: { id: 'cat-1', name: 'Dairy' },
        },
      };
      (mockPrisma.shoppingCartItem.update as jest.Mock).mockResolvedValue(updateResult);

      const response = await PUT(createPutRequest({ quantity: 5 }), routeParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.quantity).toBe(5);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingCartItem.update as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await PUT(createPutRequest({ checked: true }), routeParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to update cart item');
    });
  });

  // ==========================================
  // DELETE /api/shopping/cart/[id]
  // ==========================================

  describe('DELETE /api/shopping/cart/[id]', () => {
    const createDeleteRequest = () =>
      new NextRequest('http://localhost:3001/api/shopping/cart/cart-1', {
        method: 'DELETE',
      });

    const routeParams = { params: Promise.resolve({ id: 'cart-1' }) };

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await DELETE_BY_ID(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 404 when cart item not found', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await DELETE_BY_ID(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cart item not found');
    });

    it('should delete a cart item successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingCartItem.delete as jest.Mock).mockResolvedValue({ id: 'cart-1' });

      const response = await DELETE_BY_ID(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cart-1');
      expect(mockPrisma.shoppingCartItem.delete).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
      });
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCartItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'cart-1',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingCartItem.delete as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await DELETE_BY_ID(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to remove cart item');
    });
  });
});
