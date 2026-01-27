/**
 * Integration tests for /api/budget/transactions routes
 * Tests transactions CRUD operations with authentication and authorization
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
    budgetTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    budgetCategory: {
      findFirst: jest.fn(),
    },
    budgetPayee: {
      findFirst: jest.fn(),
    },
    budgetTag: {
      findMany: jest.fn(),
    },
    budgetTransactionTag: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    householdMember: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
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

describe('Transactions API', () => {
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

  describe('GET /api/budget/transactions', () => {
    it('should return transactions with pagination', async () => {
      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          paymentDate: null,
          amountIls: createDecimal(100),
          currency: 'ILS',
          amountOriginal: createDecimal(100),
          categoryId: 'cat-1',
          payeeId: 'payee-1',
          paymentMethod: 'credit_card',
          paymentNumber: null,
          totalPayments: null,
          notes: 'Test transaction',
          source: 'manual',
          isRecurring: false,
          isSplit: false,
          originalTransactionId: null,
          profileId: 'profile-1',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Groceries' },
          payee: { id: 'payee-1', name: 'Store' },
          profile: { id: 'profile-1', name: 'Test Profile' },
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValueOnce(1);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].amountIls).toBe(100);
      expect(data.data.pagination.total).toBe(1);
    });

    it('should filter transactions by month', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValueOnce(0);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions?month=2024-01'
      );
      await GET(request);

      expect(mockPrisma.budgetTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should filter transactions by type', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockResolvedValueOnce(0);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions?type=expense');
      await GET(request);

      expect(mockPrisma.budgetTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'expense',
          }),
        })
      );
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.count as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch transactions');
    });
  });

  describe('POST /api/budget/transactions', () => {
    it('should create a transaction successfully', async () => {
      const mockCreatedTransaction = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        paymentDate: null,
        amountIls: createDecimal(100),
        currency: 'ILS',
        amountOriginal: createDecimal(100),
        categoryId: null,
        payeeId: null,
        paymentMethod: 'cash',
        paymentNumber: null,
        totalPayments: null,
        notes: null,
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        originalTransactionId: null,
        profileId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
        payee: null,
        profile: null,
        tags: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce('tx-1');
      (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(
        mockCreatedTransaction
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.amountIls).toBe(100);
    });

    it('should create a transaction with category', async () => {
      const mockCategory = { id: 'cat-1', householdId: 'household-1' };
      const mockCreatedTransaction = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        paymentDate: null,
        amountIls: createDecimal(100),
        currency: 'ILS',
        amountOriginal: createDecimal(100),
        categoryId: 'cat-1',
        payeeId: null,
        paymentMethod: 'cash',
        paymentNumber: null,
        totalPayments: null,
        notes: null,
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        originalTransactionId: null,
        profileId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Groceries' },
        payee: null,
        profile: null,
        tags: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(mockCategory);
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce('tx-1');
      (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(
        mockCreatedTransaction
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
          categoryId: 'cat-1',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.categoryId).toBe('cat-1');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'invalid_type',
          transactionDate: '2024-01-15',
          amountIls: 100,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
          categoryId: 'invalid-cat',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Category not found');
    });

    it('should return 404 when payee not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
          payeeId: 'invalid-payee',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Payee not found');
    });

    it('should return 404 when tags not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([]); // No tags found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          transactionDate: '2024-01-15',
          amountIls: 100,
          currency: 'ILS',
          paymentMethod: 'cash',
          source: 'manual',
          isRecurring: false,
          tagIds: ['tag-1', 'tag-2'],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more tags not found');
    });
  });

  describe('GET /api/budget/transactions/[id]', () => {
    it('should return a specific transaction', async () => {
      const mockTransaction = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        paymentDate: null,
        amountIls: createDecimal(100),
        currency: 'ILS',
        amountOriginal: createDecimal(100),
        categoryId: 'cat-1',
        payeeId: null,
        paymentMethod: 'cash',
        paymentNumber: null,
        totalPayments: null,
        notes: null,
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        originalTransactionId: null,
        profileId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Groceries' },
        payee: null,
        profile: null,
        tags: [],
        splitChildren: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockTransaction);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tx-1');
    });

    it('should return 404 when transaction not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/budget/transactions/[id]', () => {
    it('should update a transaction successfully', async () => {
      const mockExisting = {
        id: 'tx-1',
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        paymentDate: null,
        amountIls: createDecimal(150),
        currency: 'ILS',
        amountOriginal: createDecimal(150),
        categoryId: null,
        payeeId: null,
        paymentMethod: 'cash',
        paymentNumber: null,
        totalPayments: null,
        notes: 'Updated note',
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        originalTransactionId: null,
        profileId: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
        payee: null,
        profile: null,
        tags: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
      (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1', {
        method: 'PUT',
        body: JSON.stringify({ amountIls: 150, notes: 'Updated note' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.amountIls).toBe(150);
    });

    it('should return 404 when transaction not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/invalid', {
        method: 'PUT',
        body: JSON.stringify({ amountIls: 150 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1', {
        method: 'PUT',
        body: JSON.stringify({ amountIls: 150 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('DELETE /api/budget/transactions/[id]', () => {
    it('should delete a transaction successfully', async () => {
      const mockExisting = {
        id: 'tx-1',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTransaction.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tx-1');
    });

    it('should return 404 when transaction not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'tx-1',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTransaction.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/tx-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete transaction');
    });
  });
});
