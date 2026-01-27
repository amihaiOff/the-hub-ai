/**
 * Integration tests for /api/budget/transactions/bulk routes
 * Tests bulk transaction operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTransaction: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    budgetCategory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    budgetPayee: {
      findMany: jest.fn(),
    },
    budgetTag: {
      findMany: jest.fn(),
    },
    budgetTransactionTag: {
      create: jest.fn(),
    },
    householdMember: {
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
import { POST, PUT, DELETE } from '../bulk/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Transactions Bulk API', () => {
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

  describe('POST /api/budget/transactions/bulk', () => {
    it('should bulk create transactions successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
            },
            {
              type: 'expense',
              transactionDate: '2024-01-16',
              amountIls: 200,
              currency: 'ILS',
              paymentMethod: 'credit_card',
              source: 'manual',
              isRecurring: false,
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.created).toBe(2);
      expect(data.data.ids).toHaveLength(2);
    });

    it('should validate categories before bulk create', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'cat-1' }]); // Only 1 of 2 found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
              categoryId: 'cat-1',
            },
            {
              type: 'expense',
              transactionDate: '2024-01-16',
              amountIls: 200,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
              categoryId: 'cat-2',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more categories not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'invalid_type',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when payees not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]); // No payees found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
              payeeId: 'payee-1',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more payees not found');
    });

    it('should return 404 when profiles not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce([]); // No profiles found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
              profileId: 'profile-1',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more profiles not found');
    });

    it('should return 404 when tags not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([]); // No tags found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
              tagIds: ['tag-1'],
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more tags not found');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              type: 'expense',
              transactionDate: '2024-01-15',
              amountIls: 100,
              currency: 'ILS',
              paymentMethod: 'cash',
              source: 'manual',
              isRecurring: false,
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create transactions');
    });
  });

  describe('PUT /api/budget/transactions/bulk', () => {
    it('should bulk categorize transactions successfully', async () => {
      const mockCategory = { id: 'cat-1', householdId: 'household-1' };
      const mockTransactions = [{ id: 'tx-1' }, { id: 'tx-2' }];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetTransaction.update as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: ['tx-1', 'tx-2'],
          categoryId: 'cat-1',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.updated).toBe(2);
      expect(data.data.categoryId).toBe('cat-1');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: ['tx-1'],
          categoryId: 'cat-1',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: [],
          categoryId: 'cat-1',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: ['tx-1'],
          categoryId: 'invalid-cat',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 404 when some transactions not found', async () => {
      const mockCategory = { id: 'cat-1', householdId: 'household-1' };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'tx-1' }]); // Only 1 of 2 found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: ['tx-1', 'tx-2'],
          categoryId: 'cat-1',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more transactions not found');
    });

    it('should return 500 on database error', async () => {
      const mockCategory = { id: 'cat-1', householdId: 'household-1' };
      const mockTransactions = [{ id: 'tx-1' }];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetTransaction.update as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({
          transactionIds: ['tx-1'],
          categoryId: 'cat-1',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to categorize transactions');
    });
  });

  describe('DELETE /api/budget/transactions/bulk', () => {
    it('should bulk delete transactions successfully', async () => {
      const mockTransactions = [{ id: 'tx-1' }, { id: 'tx-2' }];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetTransaction.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          transactionIds: ['tx-1', 'tx-2'],
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(2);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          transactionIds: ['tx-1'],
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          transactionIds: [],
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when some transactions not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'tx-1' }]); // Only 1 of 2 found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          transactionIds: ['tx-1', 'tx-2'],
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more transactions not found');
    });

    it('should return 500 on database error', async () => {
      const mockTransactions = [{ id: 'tx-1' }];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetTransaction.deleteMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          transactionIds: ['tx-1'],
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete transactions');
    });
  });
});
