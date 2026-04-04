/**
 * Integration tests for /api/shopping/categories routes
 * Tests category listing (with auto-seed) and creation.
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
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

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Shopping Categories API', () => {
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
  // GET /api/shopping/categories
  // ==========================================

  describe('GET /api/shopping/categories', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return existing categories', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const mockCategories = [
        { id: 'cat-1', name: 'Dairy', sortOrder: 0, householdId: 'household-1' },
        { id: 'cat-2', name: 'Meat & Fish', sortOrder: 1, householdId: 'household-1' },
      ];

      (mockPrisma.shoppingCategory.findMany as jest.Mock).mockResolvedValue(mockCategories);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockCategories);
      expect(mockPrisma.shoppingCategory.findMany).toHaveBeenCalledWith({
        where: { householdId: 'household-1' },
        orderBy: { sortOrder: 'asc' },
      });
      // Should not auto-seed when categories already exist
      expect(mockPrisma.shoppingCategory.create).not.toHaveBeenCalled();
    });

    it('should auto-seed default categories when none exist', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const defaultCategories = [
        { id: 'cat-1', name: 'Meat & Fish', sortOrder: 0, householdId: 'household-1' },
        { id: 'cat-2', name: 'Dairy', sortOrder: 1, householdId: 'household-1' },
        { id: 'cat-3', name: 'Fruits', sortOrder: 2, householdId: 'household-1' },
        { id: 'cat-4', name: 'Vegetables', sortOrder: 3, householdId: 'household-1' },
        { id: 'cat-5', name: 'Dry Goods', sortOrder: 4, householdId: 'household-1' },
        { id: 'cat-6', name: 'Cleaning', sortOrder: 5, householdId: 'household-1' },
        { id: 'cat-7', name: 'Beverages', sortOrder: 6, householdId: 'household-1' },
        { id: 'cat-8', name: 'Snacks', sortOrder: 7, householdId: 'household-1' },
        { id: 'cat-9', name: 'Frozen', sortOrder: 8, householdId: 'household-1' },
        { id: 'cat-10', name: 'Other', sortOrder: 9, householdId: 'household-1' },
      ];

      // First call returns empty (triggers seed), second call returns seeded categories
      (mockPrisma.shoppingCategory.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(defaultCategories);
      (mockPrisma.shoppingCategory.create as jest.Mock).mockResolvedValue({});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(10);
      // Individual creates for Neon compatibility (10 default categories)
      expect(mockPrisma.shoppingCategory.create).toHaveBeenCalledTimes(10);
      // findMany called twice: once to check, once after seed
      expect(mockPrisma.shoppingCategory.findMany).toHaveBeenCalledTimes(2);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);
      (mockPrisma.shoppingCategory.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch shopping categories');
    });
  });

  // ==========================================
  // POST /api/shopping/categories
  // ==========================================

  describe('POST /api/shopping/categories', () => {
    const createRequest = (body: Record<string, unknown>) =>
      new NextRequest('http://localhost:3001/api/shopping/categories', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await POST(createRequest({ name: 'Bakery' }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing name', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for empty name', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      const response = await POST(createRequest({ name: '  ' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should create a new category successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({
        sortOrder: 5,
      });

      const created = {
        id: 'cat-new',
        name: 'Bakery',
        sortOrder: 6,
        householdId: 'household-1',
      };
      (mockPrisma.shoppingCategory.create as jest.Mock).mockResolvedValue(created);

      const response = await POST(createRequest({ name: 'Bakery' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(created);
      expect(mockPrisma.shoppingCategory.create).toHaveBeenCalledWith({
        data: {
          name: 'Bakery',
          sortOrder: 6,
          householdId: 'household-1',
        },
      });
    });

    it('should create category with sortOrder 0 when no categories exist', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.shoppingCategory.create as jest.Mock).mockResolvedValue({
        id: 'cat-first',
        name: 'First',
        sortOrder: 0,
        householdId: 'household-1',
      });

      const response = await POST(createRequest({ name: 'First' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.shoppingCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('should return 400 for duplicate category name', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({ sortOrder: 2 });
      (mockPrisma.shoppingCategory.create as jest.Mock).mockRejectedValue(
        new Error('Unique constraint failed on the constraint')
      );

      const response = await POST(createRequest({ name: 'Dairy' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('A category with this name already exists');
    });

    it('should return 500 on unexpected error', async () => {
      mockGetCurrentContext.mockResolvedValue(mockContext);

      (mockPrisma.shoppingCategory.findFirst as jest.Mock).mockResolvedValue({ sortOrder: 0 });
      (mockPrisma.shoppingCategory.create as jest.Mock).mockRejectedValue(
        new Error('Connection lost')
      );

      const response = await POST(createRequest({ name: 'Bakery' }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create shopping category');
    });
  });
});
