/**
 * Integration tests for /api/budget/savings route
 * Tests savings CRUD operations with authentication and data aggregation.
 *
 * The savings endpoint:
 * - GET: Returns monthly savings data grouped by year, with missing months filled (hasEntries flag)
 * - POST: Creates a savings transaction with month/amount validation
 * - PUT: Updates (replaces) all savings transactions for a given month
 * - DELETE: Removes all savings transactions for a given month
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => {
  const txProxy = {
    budgetTransaction: {
      findMany: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    prisma: {
      budgetCategory: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      budgetCategoryGroup: {
        create: jest.fn(),
      },
      budgetTransaction: {
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof txProxy) => Promise<unknown>) => cb(txProxy)),
      __txProxy: txProxy,
    },
  };
});

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST, PUT, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Budget Savings API', () => {
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
    // Re-setup $transaction to call the callback with the tx proxy after resetAllMocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txProxy = (mockPrisma as any).__txProxy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockPrisma as any).$transaction.mockImplementation(
      (cb: (tx: typeof txProxy) => Promise<unknown>) => cb(txProxy)
    );
  });

  // ========================================
  // Helper to mock getOrCreateSavingsCategory
  // ========================================

  /**
   * Sets up the prisma mocks so that getOrCreateSavingsCategory returns
   * the given categoryId (either by finding an existing category or creating one).
   */
  function mockSavingsCategoryExists(categoryId: string) {
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce({
      id: categoryId,
    });
  }

  function mockSavingsCategoryCreated(categoryId: string, groupId: string = 'group-savings') {
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (mockPrisma.budgetCategoryGroup.create as jest.Mock).mockResolvedValueOnce({
      id: groupId,
      name: 'Savings',
      householdId: 'household-1',
      sortOrder: 999,
    });
    (mockPrisma.budgetCategory.create as jest.Mock).mockResolvedValueOnce({
      id: categoryId,
      name: 'Savings',
      groupId,
      householdId: 'household-1',
    });
  }

  // ========================================
  // GET /api/budget/savings
  // ========================================

  describe('GET /api/budget/savings', () => {
    describe('authentication', () => {
      it('should return 401 when not authenticated', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(null);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Unauthorized');
      });
    });

    describe('auto-create savings category', () => {
      it('should use existing savings category when it exists', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.categoryId).toBe('cat-savings-1');
        // Should NOT create a new group/category
        expect(mockPrisma.budgetCategoryGroup.create).not.toHaveBeenCalled();
        expect(mockPrisma.budgetCategory.create).not.toHaveBeenCalled();
      });

      it('should return empty result when no savings category exists (no auto-create on GET)', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.categoryId).toBeNull();
        expect(data.data.years).toEqual([]);
        // Should NOT create anything
        expect(mockPrisma.budgetCategoryGroup.create).not.toHaveBeenCalled();
        expect(mockPrisma.budgetCategory.create).not.toHaveBeenCalled();
      });
    });

    describe('empty data', () => {
      it('should return empty years array when no transactions exist', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.years).toEqual([]);
        expect(data.data.categoryId).toBe('cat-savings-1');
      });
    });

    describe('transaction aggregation', () => {
      it('should aggregate multiple transactions in the same month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const transactions = [
          { transactionDate: new Date('2025-03-01'), amountIls: 1000 },
          { transactionDate: new Date('2025-03-15'), amountIls: 500 },
          { transactionDate: new Date('2025-03-28'), amountIls: 250.5 },
        ];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        // Mock Date to control "current month" for gap-filling
        const realDate = global.Date;
        const mockNow = new Date('2025-03-15T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        expect(response.status).toBe(200);
        expect(data.data.years).toHaveLength(1);
        expect(data.data.years[0].year).toBe(2025);
        expect(data.data.years[0].months).toHaveLength(1);
        expect(data.data.years[0].months[0].month).toBe('2025-03');
        // 1000 + 500 + 250.50 = 1750.50
        expect(data.data.years[0].months[0].amount).toBe(1750.5);
        expect(data.data.years[0].total).toBe(1750.5);
      });

      it('should handle transactions across multiple months and years', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const transactions = [
          { transactionDate: new Date('2025-01-15'), amountIls: 2000 },
          { transactionDate: new Date('2025-03-10'), amountIls: 1500 },
          { transactionDate: new Date('2024-11-05'), amountIls: 3000 },
        ];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        // Set current date to 2025-03 to control gap-filling
        const realDate = global.Date;
        const mockNow = new Date('2025-03-15T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        expect(response.status).toBe(200);

        // Years should be sorted descending
        expect(data.data.years).toHaveLength(2);
        expect(data.data.years[0].year).toBe(2025);
        expect(data.data.years[1].year).toBe(2024);

        // 2025 year should have Jan, Feb (filled 0), Mar
        const year2025 = data.data.years[0];
        expect(year2025.months).toHaveLength(3);
        expect(year2025.months[0]).toEqual({
          month: '2025-01',
          amount: 2000,
          hasEntries: true,
        });
        expect(year2025.months[1]).toEqual({
          month: '2025-02',
          amount: 0,
          hasEntries: false,
        });
        expect(year2025.months[2]).toEqual({
          month: '2025-03',
          amount: 1500,
          hasEntries: true,
        });
        expect(year2025.total).toBe(3500);

        // 2024 year should have Nov, Dec (filled 0)
        const year2024 = data.data.years[1];
        expect(year2024.months).toHaveLength(2);
        expect(year2024.months[0]).toEqual({
          month: '2024-11',
          amount: 3000,
          hasEntries: true,
        });
        expect(year2024.months[1]).toEqual({
          month: '2024-12',
          amount: 0,
          hasEntries: false,
        });
        expect(year2024.total).toBe(3000);
      });
    });

    describe('missing month gap-filling', () => {
      it('should fill missing months between first savings month and current month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        // Only one transaction in January
        const transactions = [{ transactionDate: new Date('2025-01-10'), amountIls: 1000 }];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        // Current month is March
        const realDate = global.Date;
        const mockNow = new Date('2025-03-08T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        const year2025 = data.data.years[0];
        expect(year2025.months).toHaveLength(3); // Jan, Feb, Mar
        expect(year2025.months[0]).toEqual({ month: '2025-01', amount: 1000, hasEntries: true });
        expect(year2025.months[1]).toEqual({ month: '2025-02', amount: 0, hasEntries: false });
        expect(year2025.months[2]).toEqual({ month: '2025-03', amount: 0, hasEntries: false });
      });

      it('should not fill months before first savings month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        // First transaction in March
        const transactions = [{ transactionDate: new Date('2025-03-10'), amountIls: 500 }];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        const realDate = global.Date;
        const mockNow = new Date('2025-03-15T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        // Should only have March - no Jan or Feb since first savings month is March
        expect(data.data.years[0].months).toHaveLength(1);
        expect(data.data.years[0].months[0]).toEqual({
          month: '2025-03',
          amount: 500,
          hasEntries: true,
        });
      });
    });

    describe('month sorting within years', () => {
      it('should sort months Jan to Dec within each year', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        // Transactions inserted in non-chronological order
        const transactions = [
          { transactionDate: new Date('2025-03-01'), amountIls: 300 },
          { transactionDate: new Date('2025-01-01'), amountIls: 100 },
          { transactionDate: new Date('2025-02-01'), amountIls: 200 },
        ];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        const realDate = global.Date;
        const mockNow = new Date('2025-03-15T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        const months = data.data.years[0].months;
        expect(months[0].month).toBe('2025-01');
        expect(months[1].month).toBe('2025-02');
        expect(months[2].month).toBe('2025-03');
      });
    });

    describe('financial precision', () => {
      it('should use integer cents to avoid floating-point errors', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        // These values would cause floating-point issues with naive addition
        // 0.1 + 0.2 !== 0.3 in floating point
        const transactions = [
          { transactionDate: new Date('2025-01-01'), amountIls: 0.1 },
          { transactionDate: new Date('2025-01-15'), amountIls: 0.2 },
        ];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        const realDate = global.Date;
        const mockNow = new Date('2025-01-20T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        // The route uses cents-based arithmetic to avoid 0.30000000000000004
        expect(data.data.years[0].months[0].amount).toBe(0.3);
        expect(data.data.years[0].total).toBe(0.3);
      });

      it('should handle large monetary values correctly', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const transactions = [
          { transactionDate: new Date('2025-01-01'), amountIls: 50000.75 },
          { transactionDate: new Date('2025-01-15'), amountIls: 25000.25 },
        ];
        (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(transactions);

        const realDate = global.Date;
        const mockNow = new Date('2025-01-20T12:00:00Z');
        jest.spyOn(global, 'Date').mockImplementation((...args: unknown[]) => {
          if (args.length === 0) return mockNow;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return new (realDate as any)(...args);
        });

        const response = await GET();
        const data = await response.json();

        jest.restoreAllMocks();

        expect(data.data.years[0].months[0].amount).toBe(75001);
        expect(data.data.years[0].total).toBe(75001);
      });
    });

    describe('error handling', () => {
      it('should return 500 when database query fails', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        (mockPrisma.budgetCategory.findFirst as jest.Mock).mockRejectedValueOnce(
          new Error('Database connection error')
        );

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Failed to fetch savings data');
      });
    });
  });

  // ========================================
  // POST /api/budget/savings
  // ========================================

  describe('POST /api/budget/savings', () => {
    function createRequest(body: unknown): NextRequest {
      return new NextRequest('http://localhost:3000/api/budget/savings', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    describe('authentication', () => {
      it('should return 401 when not authenticated', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(null);

        const request = createRequest({ month: '2025-03', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Unauthorized');
      });
    });

    describe('month validation', () => {
      it('should reject missing month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.error).toBe('month is required (YYYY-MM format)');
      });

      it('should reject non-string month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: 202503, amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('month is required (YYYY-MM format)');
      });

      it('should reject invalid month format (no dash)', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '202503', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('month is required (YYYY-MM format)');
      });

      it('should reject invalid month format (full date)', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '2025-03-15', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('month is required (YYYY-MM format)');
      });

      it('should reject invalid month format (single digit month)', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '2025-3', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('month is required (YYYY-MM format)');
      });

      it('should accept valid YYYY-MM format', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const mockTransaction = {
          id: 'tx-new',
          type: 'expense',
          transactionDate: new Date('2025-03-01'),
          amountIls: 1000,
          amountOriginal: 1000,
          currency: 'ILS',
          categoryId: 'cat-savings-1',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-03', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      });
    });

    describe('amount validation', () => {
      it('should reject missing amount', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '2025-03' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('amount must be a non-negative number (max 999,999,999)');
      });

      it('should accept zero amount (deliberate "no savings this month")', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const mockTransaction = {
          id: 'tx-zero',
          type: 'expense',
          transactionDate: new Date('2025-03-01'),
          amountIls: 0,
          amountOriginal: 0,
          currency: 'ILS',
          categoryId: 'cat-savings-1',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-03', amount: 0 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.amount).toBe(0);
      });

      it('should reject negative amount', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '2025-03', amount: -500 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('amount must be a non-negative number (max 999,999,999)');
      });

      it('should reject non-number amount', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);

        const request = createRequest({ month: '2025-03', amount: '1000' });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('amount must be a non-negative number (max 999,999,999)');
      });

      it('should accept positive decimal amount', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const mockTransaction = {
          id: 'tx-decimal',
          type: 'expense',
          transactionDate: new Date('2025-06-01'),
          amountIls: 1234.56,
          amountOriginal: 1234.56,
          currency: 'ILS',
          categoryId: 'cat-savings-1',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-06', amount: 1234.56 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.amount).toBe(1234.56);
      });
    });

    describe('transaction creation', () => {
      it('should create transaction with correct data', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const mockTransaction = {
          id: 'tx-new-1',
          type: 'expense',
          transactionDate: new Date('2025-03-01'),
          amountIls: 5000,
          amountOriginal: 5000,
          currency: 'ILS',
          categoryId: 'cat-savings-1',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-03', amount: 5000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.id).toBe('tx-new-1');
        expect(data.data.month).toBe('2025-03');
        expect(data.data.amount).toBe(5000);

        // Verify the transaction was created with correct arguments
        expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith({
          data: {
            type: 'expense',
            transactionDate: new Date(2025, 2, 1),
            amountIls: 5000,
            amountOriginal: 5000,
            currency: 'ILS',
            categoryId: 'cat-savings-1',
            source: 'manual',
            householdId: 'household-1',
          },
        });
      });

      it('should set transactionDate to first day of the given month', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');

        const mockTransaction = {
          id: 'tx-new-2',
          type: 'expense',
          transactionDate: new Date('2025-12-01'),
          amountIls: 2000,
          amountOriginal: 2000,
          currency: 'ILS',
          categoryId: 'cat-savings-1',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-12', amount: 2000 });
        const response = await POST(request);

        expect(response.status).toBe(200);

        const createCall = (mockPrisma.budgetTransaction.create as jest.Mock).mock.calls[0][0];
        expect(createCall.data.transactionDate).toEqual(new Date(2025, 11, 1));
      });

      it('should auto-create savings category if it does not exist on POST', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryCreated('cat-savings-auto', 'group-savings-auto');

        const mockTransaction = {
          id: 'tx-auto-cat',
          type: 'expense',
          transactionDate: new Date('2025-03-01'),
          amountIls: 1500,
          amountOriginal: 1500,
          currency: 'ILS',
          categoryId: 'cat-savings-auto',
          source: 'manual',
          householdId: 'household-1',
        };
        (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

        const request = createRequest({ month: '2025-03', amount: 1500 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // Verify category was created
        expect(mockPrisma.budgetCategoryGroup.create).toHaveBeenCalled();
        expect(mockPrisma.budgetCategory.create).toHaveBeenCalled();

        // Verify transaction uses the newly created category
        expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              categoryId: 'cat-savings-auto',
            }),
          })
        );
      });
    });

    describe('error handling', () => {
      it('should return 500 when database create fails', async () => {
        mockGetCurrentContext.mockResolvedValueOnce(mockContext);
        mockSavingsCategoryExists('cat-savings-1');
        (mockPrisma.budgetTransaction.create as jest.Mock).mockRejectedValueOnce(
          new Error('Database write error')
        );

        const request = createRequest({ month: '2025-03', amount: 1000 });
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toBe('Failed to create savings entry');
      });
    });
  });

  // ========================================
  // PUT /api/budget/savings
  // ========================================

  describe('PUT /api/budget/savings', () => {
    function createRequest(body: unknown): NextRequest {
      return new NextRequest('http://localhost:3000/api/budget/savings', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = createRequest({ month: '2025-03', amount: 2000 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should reject invalid month format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = createRequest({ month: '2025-3', amount: 1000 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('month is required (YYYY-MM format)');
    });

    it('should reject invalid amount', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = createRequest({ month: '2025-03', amount: -100 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('amount must be a non-negative number (max 999,999,999)');
    });

    it('should return 404 when no savings category exists', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = createRequest({ month: '2025-03', amount: 1000 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('No savings category found');
    });

    it('should delete existing transactions and create a new one atomically', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockSavingsCategoryExists('cat-savings-1');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txProxy = (mockPrisma as any).__txProxy;
      // findMany returns transactions to delete
      (txProxy.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'old-tx-1' },
        { id: 'old-tx-2' },
      ]);
      (txProxy.budgetTransaction.delete as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const mockTransaction = {
        id: 'tx-updated',
        type: 'expense',
        transactionDate: new Date('2025-03-01'),
        amountIls: 3000,
        amountOriginal: 3000,
        currency: 'ILS',
        categoryId: 'cat-savings-1',
        source: 'manual',
        householdId: 'household-1',
      };
      (txProxy.budgetTransaction.create as jest.Mock).mockResolvedValueOnce(mockTransaction);

      const request = createRequest({ month: '2025-03', amount: 3000 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tx-updated');
      expect(data.data.amount).toBe(3000);

      // Verify $transaction was used
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mockPrisma as any).$transaction).toHaveBeenCalled();

      // Verify findMany + delete were called via tx proxy
      expect(txProxy.budgetTransaction.findMany).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: 'cat-savings-1',
          transactionDate: {
            gte: new Date(2025, 2, 1),
            lt: new Date(2025, 3, 1),
          },
        },
        select: { id: true },
      });
      expect(txProxy.budgetTransaction.delete).toHaveBeenCalledTimes(2);
    });

    it('should return 500 when database fails', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockSavingsCategoryExists('cat-savings-1');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txProxy = (mockPrisma as any).__txProxy;
      (txProxy.budgetTransaction.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('DB error')
      );

      const request = createRequest({ month: '2025-03', amount: 1000 });
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update savings entry');
    });
  });

  // ========================================
  // DELETE /api/budget/savings
  // ========================================

  describe('DELETE /api/budget/savings', () => {
    function createRequest(body: unknown): NextRequest {
      return new NextRequest('http://localhost:3000/api/budget/savings', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = createRequest({ month: '2025-03' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should reject invalid month format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = createRequest({ month: 'bad' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('month is required (YYYY-MM format)');
    });

    it('should return 404 when no savings category exists', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = createRequest({ month: '2025-03' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('No savings category found');
    });

    it('should delete all transactions for the given month', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockSavingsCategoryExists('cat-savings-1');
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'tx-1' },
        { id: 'tx-2' },
        { id: 'tx-3' },
      ]);
      (mockPrisma.budgetTransaction.delete as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const request = createRequest({ month: '2025-06' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      expect(mockPrisma.budgetTransaction.findMany).toHaveBeenCalledWith({
        where: {
          householdId: 'household-1',
          categoryId: 'cat-savings-1',
          transactionDate: {
            gte: new Date(2025, 5, 1),
            lt: new Date(2025, 6, 1),
          },
        },
        select: { id: true },
      });
      expect(mockPrisma.budgetTransaction.delete).toHaveBeenCalledTimes(3);
    });

    it('should return 500 when database fails', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockSavingsCategoryExists('cat-savings-1');
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('DB error')
      );

      const request = createRequest({ month: '2025-03' });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete savings entry');
    });
  });
});
