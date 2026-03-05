/**
 * Integration tests for /api/budget/analysis route
 * Tests budget analysis operations with authentication and authorization.
 *
 * The analysis endpoint aggregates transactions over a date range and returns:
 * - monthlyTotals: income/expenses/budgeted per month
 * - groups: category groups with nested categories and per-month spending
 * - tags: tag-level spending aggregation sorted by totalSpent descending
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
    },
    budgetCategoryGroup: {
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
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Budget Analysis API', () => {
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

  // ========================================
  // Authentication & Validation
  // ========================================

  describe('authentication and validation', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when startDate is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 when endDate is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 when both dates are missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/analysis');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid date format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=not-a-date&endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for partial date format (month only)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01&endDate=2024-03'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  // ========================================
  // Monthly Totals
  // ========================================

  describe('monthly totals aggregation', () => {
    it('should return monthly totals with income and expenses', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'income',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(5000),
          categoryId: null,
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-20'),
          amountIls: createDecimal(300),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-3',
          type: 'income',
          transactionDate: new Date('2024-02-10'),
          amountIls: createDecimal(5500),
          categoryId: null,
          tags: [],
        },
        {
          id: 'tx-4',
          type: 'expense',
          transactionDate: new Date('2024-02-15'),
          amountIls: createDecimal(450),
          categoryId: 'cat-1',
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-02-28'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.monthlyTotals).toHaveLength(2);

      // January
      expect(data.data.monthlyTotals[0].month).toBe('2024-01');
      expect(data.data.monthlyTotals[0].totalIncome).toBe(5000);
      expect(data.data.monthlyTotals[0].totalExpenses).toBe(300);
      expect(data.data.monthlyTotals[0].totalBudgeted).toBe(1000);

      // February
      expect(data.data.monthlyTotals[1].month).toBe('2024-02');
      expect(data.data.monthlyTotals[1].totalIncome).toBe(5500);
      expect(data.data.monthlyTotals[1].totalExpenses).toBe(450);
      expect(data.data.monthlyTotals[1].totalBudgeted).toBe(1000);
    });

    it('should generate month keys for the full range even without transactions', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // No transactions → no month keys generated
      expect(data.data.monthlyTotals).toHaveLength(0);
    });

    it('should handle a single-month range', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-06-01&endDate=2024-06-30'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // No transactions → no month keys generated
      expect(data.data.monthlyTotals).toHaveLength(0);
    });

    it('should calculate totalBudgeted from all category budgets', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
            {
              id: 'cat-2',
              name: 'Utilities',
              budget: createDecimal(500),
              isMust: true,
              sortOrder: 2,
            },
          ],
        },
        {
          id: 'group-2',
          name: 'Leisure',
          sortOrder: 2,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-3',
              name: 'Dining',
              budget: createDecimal(300),
              isMust: false,
              sortOrder: 1,
            },
            {
              id: 'cat-4',
              name: 'No Budget',
              budget: null,
              isMust: false,
              sortOrder: 2,
            },
          ],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      // Need at least one transaction so month keys are generated
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(100),
          categoryId: 'cat-1',
          tags: [],
        },
      ]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // 1000 + 500 + 300 + 0 (null budget) = 1800
      expect(data.data.monthlyTotals[0].totalBudgeted).toBe(1800);
    });
  });

  // ========================================
  // Category Group & Category Breakdowns
  // ========================================

  describe('groups and category breakdowns', () => {
    it('should return groups with categories and per-month spending', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
            {
              id: 'cat-2',
              name: 'Utilities',
              budget: createDecimal(500),
              isMust: true,
              sortOrder: 2,
            },
          ],
        },
        {
          id: 'group-2',
          name: 'Entertainment',
          sortOrder: 2,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-3',
              name: 'Dining',
              budget: createDecimal(300),
              isMust: false,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-10'),
          amountIls: createDecimal(200),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-25'),
          amountIls: createDecimal(150),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-3',
          type: 'expense',
          transactionDate: new Date('2024-02-05'),
          amountIls: createDecimal(100),
          categoryId: 'cat-2',
          tags: [],
        },
        {
          id: 'tx-4',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(50),
          categoryId: 'cat-3',
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-02-28'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.groups).toHaveLength(2);

      // Group 1: Essential
      const essential = data.data.groups[0];
      expect(essential.id).toBe('group-1');
      expect(essential.name).toBe('Essential');
      expect(essential.sortOrder).toBe(1);
      // totalBudgeted = (1000 + 500) * 2 months = 3000
      expect(essential.totalBudgeted).toBe(3000);
      // totalSpent = 200 + 150 + 100 = 450
      expect(essential.totalSpent).toBe(450);
      expect(essential.categories).toHaveLength(2);

      // Groceries: totalBudgeted = 1000 * 2 = 2000, totalSpent = 350
      const groceries = essential.categories[0];
      expect(groceries.id).toBe('cat-1');
      expect(groceries.name).toBe('Groceries');
      expect(groceries.totalBudgeted).toBe(2000);
      expect(groceries.totalSpent).toBe(350);
      expect(groceries.isMust).toBe(true);
      expect(groceries.monthlySpent).toHaveLength(2);
      expect(groceries.monthlySpent[0]).toEqual({ month: '2024-01', spent: 350 });
      expect(groceries.monthlySpent[1]).toEqual({ month: '2024-02', spent: 0 });

      // Utilities: totalBudgeted = 500 * 2 = 1000, totalSpent = 100
      const utilities = essential.categories[1];
      expect(utilities.id).toBe('cat-2');
      expect(utilities.totalBudgeted).toBe(1000);
      expect(utilities.totalSpent).toBe(100);
      expect(utilities.monthlySpent[0]).toEqual({ month: '2024-01', spent: 0 });
      expect(utilities.monthlySpent[1]).toEqual({ month: '2024-02', spent: 100 });

      // Group 2: Entertainment
      const entertainment = data.data.groups[1];
      expect(entertainment.id).toBe('group-2');
      expect(entertainment.totalBudgeted).toBe(600); // 300 * 2
      expect(entertainment.totalSpent).toBe(50);
    });

    it('should handle groups with no categories', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Empty Group',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.groups).toHaveLength(1);
      expect(data.data.groups[0].totalBudgeted).toBe(0);
      expect(data.data.groups[0].totalSpent).toBe(0);
      expect(data.data.groups[0].categories).toHaveLength(0);
    });

    it('should only count expense transactions for category spending (not income)', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-10'),
          amountIls: createDecimal(200),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'income',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(5000),
          categoryId: 'cat-1', // Income assigned to a category
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Only the expense (200) should be counted, not the income (5000)
      expect(data.data.groups[0].categories[0].totalSpent).toBe(200);
    });

    it('should handle categories without a budget (null budget)', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Misc',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Unbudgeted',
              budget: null,
              isMust: false,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(75.5),
          categoryId: 'cat-1',
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const cat = data.data.groups[0].categories[0];
      expect(cat.totalBudgeted).toBe(0);
      expect(cat.totalSpent).toBe(75.5);
    });

    it('should include group-level monthlySpent aggregated from categories', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
            {
              id: 'cat-2',
              name: 'Utilities',
              budget: createDecimal(500),
              isMust: true,
              sortOrder: 2,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-10'),
          amountIls: createDecimal(200),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-20'),
          amountIls: createDecimal(100),
          categoryId: 'cat-2',
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const group = data.data.groups[0];
      expect(group.monthlySpent).toHaveLength(1);
      // Group monthly spent should be sum of categories: 200 + 100 = 300
      expect(group.monthlySpent[0]).toEqual({ month: '2024-01', spent: 300 });
    });
  });

  // ========================================
  // Tag Aggregation
  // ========================================

  describe('tag aggregation', () => {
    it('should aggregate spending by tag for expense transactions', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-10'),
          amountIls: createDecimal(200),
          categoryId: 'cat-1',
          tags: [
            { tag: { id: 'tag-1', name: 'Work', color: '#ff0000' } },
            { tag: { id: 'tag-2', name: 'Personal', color: '#00ff00' } },
          ],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-20'),
          amountIls: createDecimal(150),
          categoryId: 'cat-1',
          tags: [{ tag: { id: 'tag-1', name: 'Work', color: '#ff0000' } }],
        },
        {
          id: 'tx-3',
          type: 'expense',
          transactionDate: new Date('2024-02-05'),
          amountIls: createDecimal(300),
          categoryId: 'cat-1',
          tags: [{ tag: { id: 'tag-2', name: 'Personal', color: '#00ff00' } }],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-02-28'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.tags).toHaveLength(2);

      // Tags should be sorted by totalSpent descending
      // Personal: 200 + 300 = 500
      // Work: 200 + 150 = 350
      const personalTag = data.data.tags[0];
      expect(personalTag.id).toBe('tag-2');
      expect(personalTag.name).toBe('Personal');
      expect(personalTag.color).toBe('#00ff00');
      expect(personalTag.totalSpent).toBe(500);
      expect(personalTag.transactionCount).toBe(2);
      expect(personalTag.monthlySpent).toHaveLength(2);
      expect(personalTag.monthlySpent[0]).toEqual({ month: '2024-01', spent: 200 });
      expect(personalTag.monthlySpent[1]).toEqual({ month: '2024-02', spent: 300 });

      const workTag = data.data.tags[1];
      expect(workTag.id).toBe('tag-1');
      expect(workTag.name).toBe('Work');
      expect(workTag.totalSpent).toBe(350);
      expect(workTag.transactionCount).toBe(2);
      expect(workTag.monthlySpent[0]).toEqual({ month: '2024-01', spent: 350 });
      expect(workTag.monthlySpent[1]).toEqual({ month: '2024-02', spent: 0 });
    });

    it('should not count income transactions in tag aggregation', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'income',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(5000),
          categoryId: null,
          tags: [{ tag: { id: 'tag-1', name: 'Salary', color: '#0000ff' } }],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Income should not appear in tags
      expect(data.data.tags).toHaveLength(0);
    });

    it('should return empty tags array when no expense transactions have tags', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(100),
          categoryId: 'cat-1',
          tags: [], // No tags
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.tags).toHaveLength(0);
    });
  });

  // ========================================
  // Financial Precision
  // ========================================

  describe('financial precision', () => {
    it('should round monetary values to 2 decimal places', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(100.999),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-10'),
          amountIls: createDecimal(33.33),
          categoryId: 'cat-1',
          tags: [{ tag: { id: 'tag-1', name: 'Test', color: '#ff0000' } }],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-11'),
          amountIls: createDecimal(33.33),
          categoryId: 'cat-1',
          tags: [{ tag: { id: 'tag-1', name: 'Test', color: '#ff0000' } }],
        },
        {
          id: 'tx-3',
          type: 'expense',
          transactionDate: new Date('2024-01-12'),
          amountIls: createDecimal(33.34),
          categoryId: 'cat-1',
          tags: [{ tag: { id: 'tag-1', name: 'Test', color: '#ff0000' } }],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Monthly total: 33.33 + 33.33 + 33.34 = 100.00
      expect(data.data.monthlyTotals[0].totalExpenses).toBe(100);

      // Category totalSpent
      expect(data.data.groups[0].categories[0].totalSpent).toBe(100);

      // Tag totalSpent
      expect(data.data.tags[0].totalSpent).toBe(100);

      // Values should have at most 2 decimal places
      const budget = data.data.monthlyTotals[0].totalBudgeted;
      expect(Math.round(budget * 100) / 100).toBe(budget);
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('should handle zero-value transactions', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Free Stuff',
              budget: createDecimal(0),
              isMust: false,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(0),
          categoryId: 'cat-1',
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.monthlyTotals[0].totalExpenses).toBe(0);
      expect(data.data.groups[0].categories[0].totalSpent).toBe(0);
    });

    it('should handle transactions without a categoryId', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Groceries',
              budget: createDecimal(1000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(100),
          categoryId: null, // Uncategorized
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // The uncategorized expense should count in monthly totals but not in any category
      expect(data.data.monthlyTotals[0].totalExpenses).toBe(100);
      expect(data.data.groups[0].categories[0].totalSpent).toBe(0);
    });

    it('should handle large numbers of transactions correctly', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Big Expenses',
              budget: createDecimal(100000),
              isMust: true,
              sortOrder: 1,
            },
          ],
        },
      ];

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(99999.99),
          categoryId: 'cat-1',
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'income',
          transactionDate: new Date('2024-01-01'),
          amountIls: createDecimal(150000.5),
          categoryId: null,
          tags: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.monthlyTotals[0].totalIncome).toBe(150000.5);
      expect(data.data.monthlyTotals[0].totalExpenses).toBe(99999.99);
    });

    it('should handle cross-year date ranges', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2023-11-15'),
          amountIls: createDecimal(100),
          categoryId: null,
          tags: [],
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-02-10'),
          amountIls: createDecimal(200),
          categoryId: null,
          tags: [],
        },
      ]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2023-11-01&endDate=2024-02-28'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.monthlyTotals).toHaveLength(4);
      expect(data.data.monthlyTotals[0].month).toBe('2023-11');
      expect(data.data.monthlyTotals[1].month).toBe('2023-12');
      expect(data.data.monthlyTotals[2].month).toBe('2024-01');
      expect(data.data.monthlyTotals[3].month).toBe('2024-02');
    });

    it('should handle no category groups', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.groups).toHaveLength(0);
      expect(data.data.tags).toHaveLength(0);
      // No transactions → no month keys
      expect(data.data.monthlyTotals).toHaveLength(0);
    });
  });

  // ========================================
  // Error Handling
  // ========================================

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch budget analysis');
    });

    it('should return 500 when category group fetch fails', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Category group fetch error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-03-31'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch budget analysis');
    });
  });

  // ========================================
  // Prisma Query Verification
  // ========================================

  describe('prisma query parameters', () => {
    it('should filter transactions by householdId, date range, and isSplit: false', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-03-31'
      );
      await GET(request);

      expect(mockPrisma.budgetTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            householdId: 'household-1',
            transactionDate: {
              gte: new Date('2024-01-01'),
              lte: new Date('2024-03-31'),
            },
            isSplit: false,
          }),
        })
      );
    });

    it('should filter category groups by householdId', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      await GET(request);

      expect(mockPrisma.budgetCategoryGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { householdId: 'household-1' },
        })
      );
    });

    it('should select tags relation on transactions', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/analysis?startDate=2024-01-01&endDate=2024-01-31'
      );
      await GET(request);

      expect(mockPrisma.budgetTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            tags: {
              select: {
                tag: {
                  select: { id: true, name: true, color: true },
                },
              },
            },
          }),
        })
      );
    });
  });
});
