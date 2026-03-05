/**
 * Integration tests for /api/budget/riseup-categories routes
 * Tests Riseup category listing, bulk creation, mapping updates, and soft-delete operations
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    riseupCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    budgetCategory: {
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
import { GET, POST, PUT, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Riseup Categories API', () => {
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
  // GET /api/budget/riseup-categories
  // ==========================================
  describe('GET /api/budget/riseup-categories', () => {
    it('should return all non-deleted riseup categories', async () => {
      const mockCategories = [
        {
          id: 'rc-1',
          name: 'מזון',
          isDeleted: false,
          budgetCategoryId: 'cat-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rc-2',
          name: 'תחבורה',
          isDeleted: false,
          budgetCategoryId: null,
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce(mockCategories);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('מזון');
      expect(data.data[1].budgetCategoryId).toBeNull();
    });

    it('should filter out deleted categories by default', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      await GET(request);

      expect(mockPrisma.riseupCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            householdId: 'household-1',
            isDeleted: false,
          }),
        })
      );
    });

    it('should include deleted categories when includeDeleted=true', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/riseup-categories?includeDeleted=true'
      );
      await GET(request);

      // When includeDeleted is true, isDeleted should NOT be in the where clause
      expect(mockPrisma.riseupCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { householdId: 'household-1' },
        })
      );
    });

    it('should order results by name ascending', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      await GET(request);

      expect(mockPrisma.riseupCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('DB connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch riseup categories');
    });

    it('should return empty array when no categories exist', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });
  });

  // ==========================================
  // POST /api/budget/riseup-categories
  // ==========================================
  describe('POST /api/budget/riseup-categories', () => {
    it('should create new riseup categories from provided names', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food', 'Transport'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.created).toBe(2);
      expect(data.data.existing).toBe(0);
    });

    it('should skip already existing category names', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'Food', isDeleted: false },
      ]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food', 'Transport'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(data.data.existing).toBe(1);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Transport', householdId: 'household-1' }],
        skipDuplicates: true,
      });
    });

    it('should skip deleted category names', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'OldCategory', isDeleted: true },
      ]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['OldCategory'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(0);
      expect(data.data.existing).toBe(1);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [],
        skipDuplicates: true,
      });
    });

    it('should deduplicate input category names', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food', 'Food', 'Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Food', householdId: 'household-1' }],
        skipDuplicates: true,
      });
    });

    it('should trim whitespace from category names', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['  Food  '] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Food', householdId: 'household-1' }],
        skipDuplicates: true,
      });
    });

    it('should filter out empty strings after trimming', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['  ', '', 'Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [{ name: 'Food', householdId: 'household-1' }],
        skipDuplicates: true,
      });
    });

    it('should return 400 when categoryNames is not an array', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: 'not-an-array' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryNames array is required');
    });

    it('should return 400 when categoryNames is an empty array', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: [] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryNames array is required');
    });

    it('should return 400 when categoryNames is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryNames array is required');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle skipDuplicates (concurrent requests)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      // createMany with skipDuplicates skips duplicates and returns lower count
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.created).toBe(0);
    });

    it('should query existing categories including deleted ones', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food'] }),
      });

      await POST(request);

      // The findMany should query without isDeleted filter to get all existing
      expect(mockPrisma.riseupCategory.findMany).toHaveBeenCalledWith({
        where: { householdId: 'household-1' },
        select: { name: true, isDeleted: true },
      });
    });

    it('should return 500 on unexpected database error during findMany', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('DB connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create riseup categories');
    });

    it('should handle mix of existing, deleted, and new categories', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'Existing', isDeleted: false },
        { name: 'Deleted', isDeleted: true },
      ]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Existing', 'Deleted', 'NewCategory'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(data.data.existing).toBe(2);
      expect(mockPrisma.riseupCategory.createMany).toHaveBeenCalledWith({
        data: [{ name: 'NewCategory', householdId: 'household-1' }],
        skipDuplicates: true,
      });
    });

    it('should match existing names with trimmed comparison', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: '  Food  ', isDeleted: false },
      ]);
      (mockPrisma.riseupCategory.createMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames: ['Food'] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(0);
      expect(data.data.existing).toBe(1);
    });
  });

  // ==========================================
  // PUT /api/budget/riseup-categories
  // ==========================================
  describe('PUT /api/budget/riseup-categories', () => {
    it('should update mapping to a budget category', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        isDeleted: false,
        budgetCategoryId: null,
        householdId: 'household-1',
      };
      const mockBudgetCategory = {
        id: 'cat-1',
        name: 'Groceries',
        householdId: 'household-1',
      };
      const mockUpdated = {
        ...mockExisting,
        budgetCategoryId: 'cat-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockBudgetCategory);
      (mockPrisma.riseupCategory.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: 'cat-1' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.budgetCategoryId).toBe('cat-1');
    });

    it('should clear mapping when budgetCategoryId is null', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        isDeleted: false,
        budgetCategoryId: 'cat-1',
        householdId: 'household-1',
      };
      const mockUpdated = {
        ...mockExisting,
        budgetCategoryId: null,
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.riseupCategory.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: null }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.budgetCategoryId).toBeNull();
      expect(mockPrisma.riseupCategory.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: { budgetCategoryId: null },
      });
    });

    it('should return 400 when id is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ budgetCategoryId: 'cat-1' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Riseup category ID is required');
    });

    it('should return 404 when riseup category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'nonexistent', budgetCategoryId: 'cat-1' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Riseup category not found');
    });

    it('should return 404 when target budget category not found', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: 'nonexistent-cat' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Budget category not found');
    });

    it('should verify riseup category belongs to household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-other-household', budgetCategoryId: 'cat-1' }),
      });

      await PUT(request);

      expect(mockPrisma.riseupCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'rc-other-household', householdId: 'household-1' },
      });
    });

    it('should verify budget category belongs to household', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: 'cat-other' }),
      });

      await PUT(request);

      expect(mockPrisma.budgetCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-other', householdId: 'household-1' },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: 'cat-1' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error during update', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.riseupCategory.update as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id: 'rc-1', budgetCategoryId: null }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update riseup category');
    });
  });

  // ==========================================
  // DELETE /api/budget/riseup-categories
  // ==========================================
  describe('DELETE /api/budget/riseup-categories', () => {
    it('should soft-delete a riseup category and clear mapping', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        isDeleted: false,
        budgetCategoryId: 'cat-1',
        householdId: 'household-1',
      };
      const mockUpdated = {
        ...mockExisting,
        isDeleted: true,
        budgetCategoryId: null,
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.riseupCategory.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'rc-1' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isDeleted).toBe(true);
      expect(data.data.budgetCategoryId).toBeNull();
      expect(mockPrisma.riseupCategory.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: { isDeleted: true, budgetCategoryId: null },
      });
    });

    it('should return 400 when id is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({}),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Riseup category ID is required');
    });

    it('should return 404 when riseup category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'nonexistent' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Riseup category not found');
    });

    it('should verify category belongs to household before deleting', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'rc-other' }),
      });

      await DELETE(request);

      expect(mockPrisma.riseupCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'rc-other', householdId: 'household-1' },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'rc-1' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'rc-1',
        name: 'מזון',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.riseupCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.riseupCategory.update as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const request = new NextRequest('http://localhost:3000/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'rc-1' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete riseup category');
    });
  });
});
