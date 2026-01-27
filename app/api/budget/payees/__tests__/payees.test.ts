/**
 * Integration tests for /api/budget/payees routes
 * Tests payees CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetPayee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
import { GET, POST } from '../route';
import { GET as GET_BY_ID, PUT, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Payees API', () => {
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

  describe('GET /api/budget/payees', () => {
    it('should return all payees with transaction counts', async () => {
      const mockPayees = [
        {
          id: 'payee-1',
          name: 'Grocery Store',
          categoryId: 'cat-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Groceries' },
          _count: { transactions: 5 },
        },
        {
          id: 'payee-2',
          name: 'Electric Company',
          categoryId: null,
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: null,
          _count: { transactions: 2 },
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce(mockPayees);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Grocery Store');
      expect(data.data[0].categoryName).toBe('Groceries');
      expect(data.data[0].transactionCount).toBe(5);
      expect(data.data[1].categoryName).toBeNull();
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle empty payees list', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch payees');
    });
  });

  describe('POST /api/budget/payees', () => {
    it('should create a payee successfully', async () => {
      const mockPayee = {
        id: 'payee-1',
        name: 'New Payee',
        categoryId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.create as jest.Mock).mockResolvedValueOnce(mockPayee);

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Payee' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Payee');
      expect(data.data.transactionCount).toBe(0);
    });

    it('should create a payee with default category', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Groceries',
        householdId: 'household-1',
      };
      const mockPayee = {
        id: 'payee-1',
        name: 'Grocery Store',
        categoryId: 'cat-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Groceries' },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.budgetPayee.create as jest.Mock).mockResolvedValueOnce(mockPayee);

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Grocery Store', categoryId: 'cat-1' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.categoryId).toBe('cat-1');
      expect(data.data.categoryName).toBe('Groceries');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', categoryId: 'invalid-cat' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 400 for duplicate name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing Payee' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A payee with this name already exists');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Payee' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create payee');
    });
  });

  describe('GET /api/budget/payees/[id]', () => {
    it('should return a specific payee', async () => {
      const mockPayee = {
        id: 'payee-1',
        name: 'Grocery Store',
        categoryId: 'cat-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Groceries' },
        _count: { transactions: 5 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockPayee);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('payee-1');
      expect(data.data.transactionCount).toBe(5);
    });

    it('should return 404 when payee not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Payee not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/budget/payees/[id]', () => {
    it('should update a payee successfully', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Old Name',
        categoryId: null,
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'payee-1',
        name: 'Updated Name',
        categoryId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
        _count: { transactions: 3 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetPayee.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
    });

    it('should update payee category', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Payee',
        categoryId: null,
        householdId: 'household-1',
      };
      const mockCategory = {
        id: 'cat-1',
        name: 'Groceries',
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'payee-1',
        name: 'Payee',
        categoryId: 'cat-1',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Groceries' },
        _count: { transactions: 0 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.budgetPayee.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'PUT',
        body: JSON.stringify({ categoryId: 'cat-1' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.categoryId).toBe('cat-1');
    });

    it('should return 404 when payee not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Payee not found');
    });

    it('should return 404 when target category not found', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Payee',
        categoryId: null,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'PUT',
        body: JSON.stringify({ categoryId: 'invalid-cat' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for duplicate name', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Old Name',
        categoryId: null,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetPayee.update as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Existing Name' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A payee with this name already exists');
    });
  });

  describe('DELETE /api/budget/payees/[id]', () => {
    it('should delete a payee successfully', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Payee',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetPayee.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('payee-1');
    });

    it('should return 404 when payee not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Payee not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'payee-1',
        name: 'Payee',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetPayee.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/payees/payee-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'payee-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete payee');
    });
  });
});
