/**
 * Integration tests for /api/budget/categories routes
 * Tests categories CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    budgetCategoryGroup: {
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
import { GET as GET_BY_ID, PUT, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Categories API', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
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

  describe('GET /api/budget/categories', () => {
    it('should return all categories with group info', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Groceries',
          budget: createDecimal(1000),
          isMust: true,
          sortOrder: 1,
          groupId: 'group-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          group: { id: 'group-1', name: 'Essential' },
          _count: { transactions: 5 },
        },
        {
          id: 'cat-2',
          name: 'Dining',
          budget: createDecimal(500),
          isMust: false,
          sortOrder: 2,
          groupId: 'group-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          group: { id: 'group-1', name: 'Essential' },
          _count: { transactions: 3 },
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(mockCategories);

      const request = new NextRequest('http://localhost:3000/api/budget/categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Groceries');
      expect(data.data[0].budget).toBe(1000);
      expect(data.data[0].group.name).toBe('Essential');
    });

    it('should filter by groupId when provided', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/categories?groupId=group-1'
      );
      await GET(request);

      expect(mockPrisma.budgetCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            householdId: 'household-1',
            groupId: 'group-1',
          }),
        })
      );
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle null budget values', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Miscellaneous',
          budget: null,
          isMust: false,
          sortOrder: 1,
          groupId: 'group-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          group: { id: 'group-1', name: 'Other' },
          _count: { transactions: 0 },
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(mockCategories);

      const request = new NextRequest('http://localhost:3000/api/budget/categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].budget).toBeNull();
    });
  });

  describe('POST /api/budget/categories', () => {
    it('should create a category successfully', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Essential',
        householdId: 'household-1',
      };
      const mockCategory = {
        id: 'cat-1',
        name: 'New Category',
        budget: createDecimal(500),
        isMust: true,
        sortOrder: 1,
        groupId: 'group-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        group: { id: 'group-1', name: 'Essential' },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockGroup);
      (mockPrisma.budgetCategory.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategory.create as jest.Mock).mockResolvedValueOnce(mockCategory);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Category',
          groupId: 'group-1',
          budget: 500,
          isMust: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Category');
      expect(data.data.budget).toBe(500);
    });

    it('should create a category without budget', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Essential',
        householdId: 'household-1',
      };
      const mockCategory = {
        id: 'cat-1',
        name: 'New Category',
        budget: null,
        isMust: false,
        sortOrder: 1,
        groupId: 'group-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        group: { id: 'group-1', name: 'Essential' },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockGroup);
      (mockPrisma.budgetCategory.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategory.create as jest.Mock).mockResolvedValueOnce(mockCategory);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Category',
          groupId: 'group-1',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.budget).toBeNull();
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', groupId: 'group-1' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ groupId: 'group-1' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 when groupId is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when group not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', groupId: 'invalid-group' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category group not found');
    });

    it('should return 400 for negative budget', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', groupId: 'group-1', budget: -100 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for duplicate name in group', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Essential',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockGroup);
      (mockPrisma.budgetCategory.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategory.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing', groupId: 'group-1' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A category with this name already exists in the group');
    });
  });

  describe('GET /api/budget/categories/[id]', () => {
    it('should return a specific category', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Groceries',
        budget: createDecimal(1000),
        isMust: true,
        sortOrder: 1,
        groupId: 'group-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        group: { id: 'group-1', name: 'Essential' },
        _count: { transactions: 5 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cat-1');
      expect(data.data.budget).toBe(1000);
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/budget/categories/[id]', () => {
    it('should update a category successfully', async () => {
      const mockExisting = {
        id: 'cat-1',
        name: 'Old Name',
        groupId: 'group-1',
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'cat-1',
        name: 'Updated Name',
        budget: createDecimal(750),
        isMust: true,
        sortOrder: 1,
        groupId: 'group-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        group: { id: 'group-1', name: 'Essential' },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', budget: 750 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.budget).toBe(750);
    });

    it('should allow moving category to different group', async () => {
      const mockExisting = {
        id: 'cat-1',
        name: 'Category',
        groupId: 'group-1',
        householdId: 'household-1',
      };
      const mockNewGroup = {
        id: 'group-2',
        name: 'New Group',
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'cat-1',
        name: 'Category',
        budget: null,
        isMust: false,
        sortOrder: 1,
        groupId: 'group-2',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        group: { id: 'group-2', name: 'New Group' },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockNewGroup);
      (mockPrisma.budgetCategory.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'PUT',
        body: JSON.stringify({ groupId: 'group-2' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.groupId).toBe('group-2');
    });

    it('should return 404 when target group not found', async () => {
      const mockExisting = {
        id: 'cat-1',
        name: 'Category',
        groupId: 'group-1',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'PUT',
        body: JSON.stringify({ groupId: 'invalid-group' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Target category group not found');
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/budget/categories/[id]', () => {
    it('should delete a category successfully', async () => {
      const mockExisting = {
        id: 'cat-1',
        name: 'Category',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cat-1');
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'cat-1',
        name: 'Category',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/categories/cat-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'cat-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete category');
    });
  });
});
