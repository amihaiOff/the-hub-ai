/**
 * Integration tests for /api/shopping/items routes
 * Tests item listing (with search), creation, and deletion.
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    shoppingCategory: {
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
import { GET, POST } from '../route';
import { DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Shopping Items API', () => {
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
  // GET /api/shopping/items
  // ==========================================

  describe('GET /api/shopping/items', () => {
    const createGetRequest = (search?: string) => {
      const url = search
        ? `http://localhost:3001/api/shopping/items?search=${encodeURIComponent(search)}`
        : 'http://localhost:3001/api/shopping/items';
      return new NextRequest(url);
    };

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return all items with category info and cart status', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const mockItems = [
        {
          id: 'item-1',
          name: 'Milk',
          nameHe: null,
          categoryId: 'cat-1',
          isDefault: false,
          lastPurchasedAt: null,
          warningDays: null,
          householdId: 'household-1',
          category: { id: 'cat-1', name: 'Dairy' },
          cartItems: [{ id: 'cart-1' }],
        },
        {
          id: 'item-2',
          name: 'Bread',
          nameHe: null,
          categoryId: 'cat-2',
          isDefault: false,
          lastPurchasedAt: null,
          warningDays: null,
          householdId: 'household-1',
          category: { id: 'cat-2', name: 'Dry Goods' },
          cartItems: [],
        },
      ];

      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue(mockItems);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0]).toMatchObject({
        id: 'item-1',
        name: 'Milk',
        categoryId: 'cat-1',
        categoryName: 'Dairy',
        inCart: true,
      });
      expect(data.data[1]).toMatchObject({
        id: 'item-2',
        name: 'Bread',
        categoryId: 'cat-2',
        categoryName: 'Dry Goods',
        inCart: false,
      });
    });

    it('should pass search parameter for filtering', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([]);

      await GET(createGetRequest('mil'));

      expect(mockPrisma.shoppingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            householdId: 'household-1',
            OR: [
              { name: { contains: 'mil', mode: 'insensitive' } },
              { nameHe: { contains: 'mil', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('should not include search filter when no search param', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([]);

      await GET(createGetRequest());

      expect(mockPrisma.shoppingItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            householdId: 'household-1',
          },
        })
      );
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch shopping items');
    });
  });

  // ==========================================
  // POST /api/shopping/items
  // ==========================================

  describe('POST /api/shopping/items', () => {
    const createRequest = (body: Record<string, unknown>) =>
      new NextRequest('http://localhost:3001/api/shopping/items', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await POST(createRequest({ name: 'Milk', categoryId: 'cat-1' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing name', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({ categoryId: 'cat-1' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing categoryId', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({ name: 'Milk' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when category does not belong to household', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest({ name: 'Milk', categoryId: 'cat-invalid' }));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Category not found');
    });

    it('should create item successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'cat-1',
        name: 'Dairy',
        householdId: 'household-1',
      });

      const createdItem = {
        id: 'item-new',
        name: 'Milk',
        nameHe: null,
        categoryId: 'cat-1',
        isDefault: false,
        lastPurchasedAt: null,
        warningDays: null,
        householdId: 'household-1',
        category: { id: 'cat-1', name: 'Dairy' },
      };
      (mockPrisma.shoppingItem.create as jest.Mock).mockResolvedValue(createdItem);

      const response = await POST(createRequest({ name: 'Milk', categoryId: 'cat-1' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: 'item-new',
        name: 'Milk',
        categoryId: 'cat-1',
        categoryName: 'Dairy',
        inCart: false,
      });
    });

    it('should return 400 for duplicate item name', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'cat-1',
        name: 'Dairy',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingItem.create as jest.Mock).mockRejectedValue(
        new Error('Unique constraint failed on the constraint')
      );

      const response = await POST(createRequest({ name: 'Milk', categoryId: 'cat-1' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('An item with this name already exists');
    });

    it('should return 500 on unexpected error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({
        id: 'cat-1',
        name: 'Dairy',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingItem.create as jest.Mock).mockRejectedValue(new Error('Connection lost'));

      const response = await POST(createRequest({ name: 'Milk', categoryId: 'cat-1' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create shopping item');
    });
  });

  // ==========================================
  // DELETE /api/shopping/items/[id]
  // ==========================================

  describe('DELETE /api/shopping/items/[id]', () => {
    const createDeleteRequest = () =>
      new NextRequest('http://localhost:3001/api/shopping/items/item-1', {
        method: 'DELETE',
      });

    const routeParams = { params: Promise.resolve({ id: 'item-1' }) };

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await DELETE(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 404 when item not found', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await DELETE(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Item not found');
    });

    it('should delete item successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'item-1',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingItem.delete as jest.Mock).mockResolvedValue({ id: 'item-1' });

      const response = await DELETE(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('item-1');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingItem.findFirst as jest.Mock).mockResolvedValue({
        id: 'item-1',
        householdId: 'household-1',
      });
      (mockPrisma.shoppingItem.delete as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await DELETE(createDeleteRequest(), routeParams);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete shopping item');
    });
  });
});
