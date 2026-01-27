/**
 * Integration tests for /api/budget/summary routes
 * Tests budget summary operations with authentication and authorization
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
    },
    budgetTransaction: {
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

describe('Budget Summary API', () => {
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

  describe('GET /api/budget/summary', () => {
    it('should return budget summary with spending by category', async () => {
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
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(200),
          categoryId: 'cat-1',
          payeeId: 'payee-1',
          paymentMethod: 'cash',
          notes: null,
          payee: { id: 'payee-1', name: 'Store' },
        },
        {
          id: 'tx-2',
          type: 'expense',
          transactionDate: new Date('2024-01-16'),
          amountIls: createDecimal(100),
          categoryId: 'cat-1',
          payeeId: null,
          paymentMethod: 'credit_card',
          notes: null,
          payee: null,
        },
        {
          id: 'tx-3',
          type: 'expense',
          transactionDate: new Date('2024-01-20'),
          amountIls: createDecimal(50),
          categoryId: 'cat-3',
          payeeId: null,
          paymentMethod: 'cash',
          notes: null,
          payee: null,
        },
        {
          id: 'tx-4',
          type: 'income',
          transactionDate: new Date('2024-01-01'),
          amountIls: createDecimal(5000),
          categoryId: null,
          payeeId: null,
          paymentMethod: 'bank_transfer',
          notes: null,
          payee: null,
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.month).toBe('2024-01');
      expect(data.data.totalIncome).toBe(5000);
      expect(data.data.totalSpent).toBe(350); // 200 + 100 + 50
      expect(data.data.categoryGroups).toHaveLength(2);

      // Check first group
      const essentialGroup = data.data.categoryGroups[0];
      expect(essentialGroup.name).toBe('Essential');
      expect(essentialGroup.totalBudgeted).toBe(1500); // 1000 + 500
      expect(essentialGroup.totalSpent).toBe(300); // 200 + 100 for groceries

      // Check groceries category
      const groceriesCategory = essentialGroup.categories[0];
      expect(groceriesCategory.categoryName).toBe('Groceries');
      expect(groceriesCategory.budgeted).toBe(1000);
      expect(groceriesCategory.spent).toBe(300);
      expect(groceriesCategory.available).toBe(700);
      expect(groceriesCategory.transactions).toHaveLength(2);
    });

    it('should include uncategorized spending', async () => {
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
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          amountIls: createDecimal(100),
          categoryId: null, // Uncategorized
          payeeId: null,
          paymentMethod: 'cash',
          notes: null,
          payee: null,
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.categoryGroups).toHaveLength(2); // Essential + Uncategorized

      const uncategorizedGroup = data.data.categoryGroups.find(
        (g: { id: string }) => g.id === 'uncategorized'
      );
      expect(uncategorizedGroup).toBeDefined();
      expect(uncategorizedGroup.name).toBe('Uncategorized');
      expect(uncategorizedGroup.totalSpent).toBe(100);
      expect(uncategorizedGroup.categories[0].spent).toBe(100);
    });

    it('should handle empty transactions', async () => {
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

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.totalIncome).toBe(0);
      expect(data.data.totalSpent).toBe(0);
      expect(data.data.totalBudgeted).toBe(1000);
      expect(data.data.categoryGroups[0].categories[0].spent).toBe(0);
      expect(data.data.categoryGroups[0].categories[0].available).toBe(1000);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when month is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/summary');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid month format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch budget summary');
    });

    it('should handle categories without budget', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Essential',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Miscellaneous',
              budget: null, // No budget set
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
          amountIls: createDecimal(50),
          categoryId: 'cat-1',
          payeeId: null,
          paymentMethod: 'cash',
          notes: null,
          payee: null,
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(mockTransactions);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const category = data.data.categoryGroups[0].categories[0];
      expect(category.budgeted).toBe(0);
      expect(category.spent).toBe(50);
      expect(category.available).toBe(-50); // Overspent
    });

    it('should calculate totals correctly across multiple groups', async () => {
      const mockCategoryGroups = [
        {
          id: 'group-1',
          name: 'Group 1',
          sortOrder: 1,
          householdId: 'household-1',
          categories: [
            { id: 'cat-1', name: 'Cat 1', budget: createDecimal(100), isMust: true, sortOrder: 1 },
          ],
        },
        {
          id: 'group-2',
          name: 'Group 2',
          sortOrder: 2,
          householdId: 'household-1',
          categories: [
            { id: 'cat-2', name: 'Cat 2', budget: createDecimal(200), isMust: false, sortOrder: 1 },
          ],
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockCategoryGroups
      );
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest('http://localhost:3000/api/budget/summary?month=2024-01');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.totalBudgeted).toBe(300); // 100 + 200
    });
  });
});
