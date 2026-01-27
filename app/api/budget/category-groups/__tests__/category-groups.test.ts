/**
 * Integration tests for /api/budget/category-groups routes
 * Tests category groups CRUD operations with authentication and authorization
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
    budgetCategoryGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    budgetCategory: {
      findMany: jest.fn(),
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

describe('Category Groups API', () => {
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

  describe('GET /api/budget/category-groups', () => {
    it('should return all category groups with categories', async () => {
      const mockGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          categories: [
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
            },
          ],
        },
        {
          id: 'group-2',
          name: 'Entertainment',
          sortOrder: 2,
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(mockGroups);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Essential');
      expect(data.data[0].categories).toHaveLength(1);
      expect(data.data[0].categories[0].budget).toBe(1000);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle empty groups list', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch category groups');
    });
  });

  describe('POST /api/budget/category-groups', () => {
    it('should create a category group successfully', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'New Group',
        sortOrder: 1,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        categories: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategoryGroup.create as jest.Mock).mockResolvedValueOnce(mockGroup);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Group' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Group');
    });

    it('should create a category group with explicit sortOrder', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'New Group',
        sortOrder: 5,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        categories: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.create as jest.Mock).mockResolvedValueOnce(mockGroup);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Group', sortOrder: 5 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.sortOrder).toBe(5);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Group' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 when name is empty', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for duplicate name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategoryGroup.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing Group' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A category group with this name already exists');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.aggregate as jest.Mock).mockResolvedValueOnce({
        _max: { sortOrder: 0 },
      });
      (mockPrisma.budgetCategoryGroup.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Group' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create category group');
    });
  });

  describe('GET /api/budget/category-groups/[id]', () => {
    it('should return a specific category group', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Essential',
        sortOrder: 1,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        categories: [
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
          },
        ],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockGroup);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('group-1');
      expect(data.data.categories).toHaveLength(1);
    });

    it('should return 404 when group not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category group not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/budget/category-groups/[id]', () => {
    it('should update a category group successfully', async () => {
      const mockExisting = {
        id: 'group-1',
        name: 'Old Name',
        sortOrder: 1,
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'group-1',
        name: 'Updated Name',
        sortOrder: 1,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        categories: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
    });

    it('should update sortOrder', async () => {
      const mockExisting = {
        id: 'group-1',
        name: 'Group',
        sortOrder: 1,
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'group-1',
        name: 'Group',
        sortOrder: 5,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        categories: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'PUT',
        body: JSON.stringify({ sortOrder: 5 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.sortOrder).toBe(5);
    });

    it('should return 404 when group not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category group not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for duplicate name', async () => {
      const mockExisting = {
        id: 'group-1',
        name: 'Old Name',
        sortOrder: 1,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.update as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Existing Group' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A category group with this name already exists');
    });
  });

  describe('DELETE /api/budget/category-groups/[id]', () => {
    it('should delete a category group successfully', async () => {
      const mockExisting = {
        id: 'group-1',
        name: 'Group',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('group-1');
    });

    it('should return 404 when group not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category group not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'group-1',
        name: 'Group',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategoryGroup.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/category-groups/group-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'group-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete category group');
    });
  });
});
