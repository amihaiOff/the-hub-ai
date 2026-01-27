/**
 * Integration tests for /api/budget/transactions/split routes
 * Tests transaction split operations with authentication and authorization
 */

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => {
  const decimal = new Prisma.Decimal(value);
  return decimal;
};

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTransaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    budgetCategory: {
      findMany: jest.fn(),
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
import { POST, DELETE } from '../split/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Transactions Split API', () => {
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

  describe('POST /api/budget/transactions/split', () => {
    it('should split a transaction successfully', async () => {
      const mockOriginalTransaction = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        paymentDate: null,
        amountIls: createDecimal(100),
        currency: 'ILS',
        payeeId: 'payee-1',
        paymentMethod: 'cash',
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        profileId: 'profile-1',
        householdId: 'household-1',
      };

      const mockSplitResult = {
        id: 'tx-1',
        type: 'expense',
        transactionDate: new Date('2024-01-15'),
        amountIls: createDecimal(100),
        isSplit: true,
        category: null,
        payee: { id: 'payee-1', name: 'Store' },
        profile: { id: 'profile-1', name: 'Test Profile' },
        tags: [],
        splitChildren: [
          {
            id: 'split-1',
            amountIls: createDecimal(60),
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'Groceries' },
            notes: 'Food',
          },
          {
            id: 'split-2',
            amountIls: createDecimal(40),
            categoryId: 'cat-2',
            category: { id: 'cat-2', name: 'Household' },
            notes: 'Cleaning supplies',
          },
        ],
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
        mockOriginalTransaction
      );
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ]);
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce(undefined);
      (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(mockSplitResult);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [
            { amountIls: 60, categoryId: 'cat-1', notes: 'Food' },
            { amountIls: 40, categoryId: 'cat-2', notes: 'Cleaning supplies' },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isSplit).toBe(true);
      expect(data.data.splitChildren).toHaveLength(2);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [{ amountIls: 50 }, { amountIls: 50 }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [], // Empty splits array
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when original transaction not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'invalid-tx',
          splits: [{ amountIls: 50 }, { amountIls: 50 }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Original transaction not found');
    });

    it('should return 400 when transaction is already split', async () => {
      const mockOriginalTransaction = {
        id: 'tx-1',
        amountIls: createDecimal(100),
        isSplit: true, // Already split
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
        mockOriginalTransaction
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [{ amountIls: 50 }, { amountIls: 50 }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Transaction is already split');
    });

    it('should return 400 when split amounts do not equal original amount', async () => {
      const mockOriginalTransaction = {
        id: 'tx-1',
        amountIls: createDecimal(100),
        isSplit: false,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
        mockOriginalTransaction
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [
            { amountIls: 60 },
            { amountIls: 50 }, // Total is 110, not 100
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Split amounts');
      expect(data.error).toContain('must equal original amount');
    });

    it('should return 404 when split category not found', async () => {
      const mockOriginalTransaction = {
        id: 'tx-1',
        amountIls: createDecimal(100),
        isSplit: false,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
        mockOriginalTransaction
      );
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'cat-1' }]); // Only 1 of 2 found

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [
            { amountIls: 60, categoryId: 'cat-1' },
            { amountIls: 40, categoryId: 'cat-2' }, // cat-2 not found
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more categories not found');
    });

    it('should return 500 on database error', async () => {
      const mockOriginalTransaction = {
        id: 'tx-1',
        amountIls: createDecimal(100),
        isSplit: false,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
        mockOriginalTransaction
      );
      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'POST',
        body: JSON.stringify({
          originalTransactionId: 'tx-1',
          splits: [{ amountIls: 50 }, { amountIls: 50 }],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to split transaction');
    });
  });

  describe('DELETE /api/budget/transactions/split', () => {
    it('should unsplit a transaction successfully', async () => {
      const mockTransaction = {
        id: 'tx-1',
        isSplit: true,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockTransaction);
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce(undefined);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions/split?transactionId=tx-1',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tx-1');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions/split?transactionId=tx-1',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when transactionId is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/split', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Transaction ID is required');
    });

    it('should return 404 when transaction not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions/split?transactionId=invalid',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Transaction not found');
    });

    it('should return 400 when transaction is not split', async () => {
      const mockTransaction = {
        id: 'tx-1',
        isSplit: false, // Not split
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockTransaction);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions/split?transactionId=tx-1',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Transaction is not split');
    });

    it('should return 500 on database error', async () => {
      const mockTransaction = {
        id: 'tx-1',
        isSplit: true,
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(mockTransaction);
      (mockPrisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest(
        'http://localhost:3000/api/budget/transactions/split?transactionId=tx-1',
        {
          method: 'DELETE',
        }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to unsplit transaction');
    });
  });
});
