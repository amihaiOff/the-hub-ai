/**
 * Integration tests for /api/budget/transactions/import route
 * Tests CSV import with Riseup category auto-creation and DB-driven mapping
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
    budgetPayee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    riseupCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    budgetTransaction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    budgetCategory: {
      findFirst: jest.fn(),
    },
    payeeCategoryRule: {
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
import { POST } from '../../transactions/import/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Import Transactions API', () => {
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

  const makeTransaction = (overrides: Record<string, unknown> = {}) => ({
    type: 'expense' as const,
    transactionDate: '2025-01-15',
    amountIls: 100,
    payeeName: 'Test Payee',
    riseupCategory: null,
    source: 'bank_import' as const,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // Payee category rules are fetched first in importTransactions — default to empty
    (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
      method: 'POST',
      body: JSON.stringify({ transactions: [makeTransaction()] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid body (empty transactions)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
      method: 'POST',
      body: JSON.stringify({ transactions: [] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should import a single transaction successfully', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    // Existing payees
    (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'payee-1', name: 'Test Payee', categoryId: null },
    ]);

    // Riseup categories (empty)
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

    // Existing transactions for duplicate detection (empty)
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

    // Create transaction
    (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

    const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
      method: 'POST',
      body: JSON.stringify({ transactions: [makeTransaction()] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.created).toBe(1);
    expect(data.data.duplicatesSkipped).toBe(0);
  });

  it('should create new payees for unknown payee names', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    // No existing payees
    (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

    // New payee creation
    (mockPrisma.budgetPayee.create as jest.Mock).mockResolvedValueOnce({
      id: 'new-payee-1',
      name: 'New Store',
    });

    (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

    const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
      method: 'POST',
      body: JSON.stringify({
        transactions: [makeTransaction({ payeeName: 'New Store' })],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.created).toBe(1);
    expect(data.data.payeesCreated).toContain('New Store');
    expect(mockPrisma.budgetPayee.create).toHaveBeenCalledWith({
      data: { name: 'New Store', householdId: 'household-1' },
    });
  });

  it('should skip duplicate transactions', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'payee-1', name: 'Test Payee', categoryId: null },
    ]);
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

    // Existing transaction that matches the import
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
      {
        transactionDate: new Date('2025-01-15'),
        amountIls: createDecimal(100),
        payee: { name: 'Test Payee' },
      },
    ]);

    const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
      method: 'POST',
      body: JSON.stringify({
        transactions: [makeTransaction({ amountIls: 100 })],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.created).toBe(0);
    expect(data.data.duplicatesSkipped).toBe(1);
  });

  // ==========================================
  // Riseup Category Auto-Creation
  // ==========================================
  describe('Riseup category auto-creation', () => {
    it('should auto-create new riseup categories from CSV', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
      ]);

      // No existing riseup categories
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Auto-create the new riseup category
      (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
        id: 'rc-new',
        name: 'מזון',
        householdId: 'household-1',
      });

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Store A', riseupCategory: 'מזון' })],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(mockPrisma.riseupCategory.create).toHaveBeenCalledWith({
        data: { name: 'מזון', householdId: 'household-1' },
      });
    });

    it('should not re-create existing riseup categories', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
      ]);

      // Riseup category already exists
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: 'cat-1', isDeleted: false },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Store A', riseupCategory: 'מזון' })],
        }),
      });

      await POST(request);

      expect(mockPrisma.riseupCategory.create).not.toHaveBeenCalled();
    });

    it('should not re-create deleted riseup categories', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
      ]);

      // Deleted riseup category
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: null, isDeleted: true },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Store A', riseupCategory: 'מזון' })],
        }),
      });

      await POST(request);

      // Should NOT re-create a deleted category
      expect(mockPrisma.riseupCategory.create).not.toHaveBeenCalled();
    });

    it('should handle concurrent import (unique constraint error) gracefully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Unique constraint violation on create (another import created it first)
      (mockPrisma.riseupCategory.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed')
      );

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Store A', riseupCategory: 'מזון' })],
        }),
      });

      // Should not throw - the error is caught gracefully
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
    });

    it('should deduplicate riseup categories within a single batch', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
        { id: 'payee-2', name: 'Store B', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Only one create call despite two transactions with same riseup category
      (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
        id: 'rc-new',
        name: 'מזון',
      });

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            makeTransaction({
              payeeName: 'Store A',
              riseupCategory: 'מזון',
              transactionDate: '2025-01-15',
            }),
            makeTransaction({
              payeeName: 'Store B',
              riseupCategory: 'מזון',
              transactionDate: '2025-01-16',
              amountIls: 200,
            }),
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(2);
      // Only one create call for the riseup category
      expect(mockPrisma.riseupCategory.create).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // DB-Driven Category Mapping
  // ==========================================
  describe('DB-driven Riseup category mapping', () => {
    it('should map transaction to budget category via riseup mapping', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Supermarket', categoryId: null },
      ]);

      // Riseup category with mapping to budget category
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: 'cat-groceries', isDeleted: false },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Supermarket', riseupCategory: 'מזון' })],
        }),
      });

      await POST(request);

      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-groceries',
            payeeId: 'payee-1',
          }),
        })
      );
    });

    it('should fall back to payee default category when no riseup mapping exists', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Supermarket', categoryId: 'cat-payee-default' },
      ]);

      // Riseup category exists but has no mapping
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: null, isDeleted: false },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Supermarket', riseupCategory: 'מזון' })],
        }),
      });

      await POST(request);

      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-payee-default',
          }),
        })
      );
    });

    it('should prioritize riseup mapping over payee default category', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Payee has a default category
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Supermarket', categoryId: 'cat-payee-default' },
      ]);

      // Riseup category has a different mapping
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: 'cat-riseup-mapped', isDeleted: false },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Supermarket', riseupCategory: 'מזון' })],
        }),
      });

      await POST(request);

      // Riseup mapping takes priority
      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-riseup-mapped',
          }),
        })
      );
    });

    it('should leave categoryId null when no mapping and no payee default', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Unknown Store', categoryId: null },
      ]);

      // No riseup categories
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Unknown Store', riseupCategory: null })],
        }),
      });

      await POST(request);

      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: null,
          }),
        })
      );
    });

    it('should handle transactions without riseupCategory field', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store', categoryId: 'cat-default' },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Store', riseupCategory: undefined })],
        }),
      });

      await POST(request);

      // Should fall back to payee's default category
      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-default',
          }),
        })
      );
    });
  });

  // ==========================================
  // Duplicate Detection Within Batch
  // ==========================================
  describe('within-batch duplicate detection', () => {
    it('should not create duplicates within the same batch', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const tx = makeTransaction({ payeeName: 'Store', amountIls: 50 });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [tx, tx], // Same transaction twice
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // First one created, second one detected as duplicate
      expect(data.data.created).toBe(1);
      expect(data.data.duplicatesSkipped).toBe(1);
    });
  });

  // ==========================================
  // Payee case-insensitive matching
  // ==========================================
  describe('payee resolution', () => {
    it('should match payees case-insensitively', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Test Payee', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'test payee' })],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      // Should not create a new payee since it exists (case-insensitive)
      expect(mockPrisma.budgetPayee.create).not.toHaveBeenCalled();
    });

    it('should handle concurrent payee creation failure with fallback lookup', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Create fails (unique constraint from concurrent import)
      (mockPrisma.budgetPayee.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed')
      );
      // Fallback findFirst succeeds
      (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'payee-concurrent',
        categoryId: null,
      });

      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'New Store' })],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);
      expect(mockPrisma.budgetPayee.findFirst).toHaveBeenCalledWith({
        where: { householdId: 'household-1', name: 'New Store' },
        select: { id: true, categoryId: true },
      });
    });
  });

  // ==========================================
  // Payee default category auto-set from Riseup mapping
  // ==========================================
  describe('payee default category from Riseup mapping', () => {
    it('should set payee default category when Riseup mapping exists and payee has no default', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Payee with no default category
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Supermarket', categoryId: null },
      ]);

      // Riseup category mapped to a budget category
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: 'cat-groceries', isDeleted: false },
      ]);

      (mockPrisma.budgetPayee.update as jest.Mock).mockResolvedValueOnce({});
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Supermarket', riseupCategory: 'מזון' })],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);

      // Should update the payee's default category
      expect(mockPrisma.budgetPayee.update).toHaveBeenCalledWith({
        where: { id: 'payee-1' },
        data: { categoryId: 'cat-groceries' },
      });
    });

    it('should NOT overwrite existing payee default category', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Payee already has a default category
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Supermarket', categoryId: 'cat-existing' },
      ]);

      // Riseup category mapped to a different budget category
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([
        { name: 'מזון', budgetCategoryId: 'cat-groceries', isDeleted: false },
      ]);

      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [makeTransaction({ payeeName: 'Supermarket', riseupCategory: 'מזון' })],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(1);

      // Should NOT update the payee - it already has a default category
      expect(mockPrisma.budgetPayee.update).not.toHaveBeenCalled();

      // Transaction should use the Riseup mapping (not the payee default)
      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-groceries',
          }),
        })
      );
    });
  });

  // ==========================================
  // Error handling
  // ==========================================
  describe('error handling', () => {
    it('should return 500 on unexpected database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // findMany throws
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Connection lost')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify({ transactions: [makeTransaction()] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to import transactions');
    });
  });
});
