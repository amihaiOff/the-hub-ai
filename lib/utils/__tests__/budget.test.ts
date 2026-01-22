/**
 * Unit tests for budget utility functions
 * Tests financial calculations, formatting utilities, and mock data structure
 */

import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetCategory,
  type BudgetPayee,
  type BudgetTag,
  type BudgetMonthSummary,
  type CategoryGroupSummary,
  type CategorySpending,
  type BudgetStatus,
  getBudgetStatus,
  formatCurrencyILS,
  formatCurrencyILSPrecise,
  formatDate,
  formatMonth,
  getCurrentMonth,
  getPreviousMonth,
  getNextMonth,
  calculateMonthSummary,
  getPayeeName,
  getCategoryName,
  getCategoryWithGroup,
  TAG_COLORS,
  MOCK_CATEGORY_GROUPS,
  MOCK_PAYEES,
  MOCK_TAGS,
  MOCK_TRANSACTIONS,
} from '../budget';

describe('Budget Utility Functions', () => {
  describe('getBudgetStatus', () => {
    it('should return "zero" when both budgeted and spent are zero', () => {
      expect(getBudgetStatus(0, 0)).toBe('zero');
    });

    it('should return "overspent" when spent exceeds budget', () => {
      expect(getBudgetStatus(1000, 1500)).toBe('overspent');
    });

    it('should return "overspent" when budget is zero but has spending', () => {
      expect(getBudgetStatus(0, 100)).toBe('overspent');
    });

    it('should return "funded" when budget has spending within limit', () => {
      expect(getBudgetStatus(1000, 800)).toBe('funded');
    });

    it('should return "funded" when spending exactly equals budget', () => {
      expect(getBudgetStatus(1000, 1000)).toBe('funded');
    });

    it('should return "funded" when budget is set but no spending yet', () => {
      expect(getBudgetStatus(1000, 0)).toBe('funded');
    });

    it('should handle very large numbers', () => {
      expect(getBudgetStatus(1000000, 500000)).toBe('funded');
      expect(getBudgetStatus(1000000, 1500000)).toBe('overspent');
    });

    it('should handle decimal values', () => {
      expect(getBudgetStatus(100.5, 50.25)).toBe('funded');
      expect(getBudgetStatus(100.5, 150.75)).toBe('overspent');
    });
  });

  describe('formatCurrencyILS', () => {
    it('should format positive numbers correctly', () => {
      const formatted = formatCurrencyILS(1000);
      expect(formatted).toContain('1,000');
    });

    it('should format zero correctly', () => {
      const formatted = formatCurrencyILS(0);
      expect(formatted).toContain('0');
    });

    it('should format negative numbers correctly', () => {
      const formatted = formatCurrencyILS(-1000);
      expect(formatted).toContain('1,000');
    });

    it('should round to whole numbers (no decimal places)', () => {
      const formatted = formatCurrencyILS(1000.99);
      // Should not include decimal places
      expect(formatted).not.toContain('.99');
    });

    it('should handle large numbers', () => {
      const formatted = formatCurrencyILS(1234567);
      expect(formatted).toContain('1,234,567');
    });
  });

  describe('formatCurrencyILSPrecise', () => {
    it('should format with exactly 2 decimal places', () => {
      const formatted = formatCurrencyILSPrecise(1000.5);
      expect(formatted).toContain('1,000.50');
    });

    it('should format whole numbers with .00', () => {
      const formatted = formatCurrencyILSPrecise(1000);
      expect(formatted).toContain('1,000.00');
    });

    it('should round to 2 decimal places', () => {
      const formatted = formatCurrencyILSPrecise(1000.999);
      expect(formatted).toContain('1,001.00');
    });

    it('should handle zero correctly', () => {
      const formatted = formatCurrencyILSPrecise(0);
      expect(formatted).toContain('0.00');
    });
  });

  describe('formatDate', () => {
    it('should format date string to DD/MM/YYYY format', () => {
      const formatted = formatDate('2024-01-15');
      expect(formatted).toBe('15/01/2024');
    });

    it('should handle ISO date strings', () => {
      const formatted = formatDate('2024-06-20T00:00:00.000Z');
      expect(formatted).toBe('20/06/2024');
    });

    it('should handle end of year', () => {
      const formatted = formatDate('2024-12-31');
      expect(formatted).toBe('31/12/2024');
    });

    it('should handle start of year', () => {
      const formatted = formatDate('2024-01-01');
      expect(formatted).toBe('01/01/2024');
    });
  });

  describe('formatMonth', () => {
    it('should format YYYY-MM to full month and year', () => {
      const formatted = formatMonth('2024-01');
      expect(formatted).toBe('January 2024');
    });

    it('should handle all months', () => {
      expect(formatMonth('2024-06')).toBe('June 2024');
      expect(formatMonth('2024-12')).toBe('December 2024');
    });

    it('should handle different years', () => {
      expect(formatMonth('2023-05')).toBe('May 2023');
      expect(formatMonth('2025-03')).toBe('March 2025');
    });
  });

  describe('getCurrentMonth', () => {
    it('should return current month in YYYY-MM format', () => {
      const current = getCurrentMonth();
      expect(current).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should match actual current date', () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(getCurrentMonth()).toBe(expected);
    });
  });

  describe('getPreviousMonth', () => {
    it('should return previous month correctly', () => {
      expect(getPreviousMonth('2024-06')).toBe('2024-05');
    });

    it('should handle year boundary', () => {
      expect(getPreviousMonth('2024-01')).toBe('2023-12');
    });

    it('should handle December', () => {
      expect(getPreviousMonth('2024-12')).toBe('2024-11');
    });

    it('should pad single digit months', () => {
      expect(getPreviousMonth('2024-03')).toBe('2024-02');
    });
  });

  describe('getNextMonth', () => {
    it('should return next month correctly', () => {
      expect(getNextMonth('2024-06')).toBe('2024-07');
    });

    it('should handle year boundary', () => {
      expect(getNextMonth('2024-12')).toBe('2025-01');
    });

    it('should handle January', () => {
      expect(getNextMonth('2024-01')).toBe('2024-02');
    });

    it('should pad single digit months', () => {
      expect(getNextMonth('2024-08')).toBe('2024-09');
    });
  });

  describe('calculateMonthSummary', () => {
    const mockCategoryGroups: BudgetCategoryGroup[] = [
      {
        id: 'group-1',
        name: 'Bills',
        sortOrder: 1,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-1',
            name: 'Rent',
            groupId: 'group-1',
            budget: 5000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
          {
            id: 'cat-2',
            name: 'Utilities',
            groupId: 'group-1',
            budget: 500,
            isMust: true,
            sortOrder: 2,
            householdId: 'hh-1',
          },
        ],
      },
      {
        id: 'group-2',
        name: 'Living',
        sortOrder: 2,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-3',
            name: 'Groceries',
            groupId: 'group-2',
            budget: 2000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
        ],
      },
    ];

    const createTransaction = (
      id: string,
      type: 'income' | 'expense',
      date: string,
      amount: number,
      categoryId: string | null
    ): BudgetTransaction => ({
      id,
      type,
      transactionDate: date,
      paymentDate: date,
      amountIls: amount,
      currency: 'ILS',
      amountOriginal: amount,
      categoryId,
      payeeId: null,
      paymentMethod: 'credit_card',
      paymentNumber: null,
      totalPayments: null,
      notes: null,
      source: 'manual',
      isRecurring: false,
      isSplit: false,
      originalTransactionId: null,
      profileId: null,
      householdId: 'hh-1',
      tagIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('should calculate month summary correctly', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'income', '2024-06-01', 10000, null),
        createTransaction('tx-2', 'expense', '2024-06-01', 5000, 'cat-1'),
        createTransaction('tx-3', 'expense', '2024-06-05', 300, 'cat-2'),
        createTransaction('tx-4', 'expense', '2024-06-10', 1500, 'cat-3'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);

      expect(summary.month).toBe('2024-06');
      expect(summary.totalIncome).toBe(10000);
      expect(summary.totalSpent).toBe(6800); // 5000 + 300 + 1500
      expect(summary.totalBudgeted).toBe(7500); // 5000 + 500 + 2000
      expect(summary.categoryGroups).toHaveLength(2);
    });

    it('should filter transactions by month', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'income', '2024-06-01', 10000, null),
        createTransaction('tx-2', 'expense', '2024-06-15', 1000, 'cat-1'),
        createTransaction('tx-3', 'expense', '2024-05-15', 2000, 'cat-1'), // Previous month
        createTransaction('tx-4', 'expense', '2024-07-01', 3000, 'cat-1'), // Next month
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);

      expect(summary.totalIncome).toBe(10000);
      expect(summary.totalSpent).toBe(1000);
    });

    it('should calculate category spending correctly', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 4000, 'cat-1'),
        createTransaction('tx-2', 'expense', '2024-06-05', 1000, 'cat-1'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
      const rentCategory = summary.categoryGroups[0].categories.find(
        (c) => c.categoryId === 'cat-1'
      );

      expect(rentCategory).toBeDefined();
      expect(rentCategory?.spent).toBe(5000);
      expect(rentCategory?.budgeted).toBe(5000);
      expect(rentCategory?.available).toBe(0);
    });

    it('should calculate negative available when overspent', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 6000, 'cat-1'), // Over budget
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
      const rentCategory = summary.categoryGroups[0].categories.find(
        (c) => c.categoryId === 'cat-1'
      );

      expect(rentCategory?.available).toBe(-1000); // 5000 budget - 6000 spent
    });

    it('should handle empty transactions', () => {
      const summary = calculateMonthSummary('2024-06', [], mockCategoryGroups);

      expect(summary.totalIncome).toBe(0);
      expect(summary.totalSpent).toBe(0);
      expect(summary.totalBudgeted).toBe(7500);
    });

    it('should handle transactions without category', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 500, null), // Uncategorized
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);

      // Uncategorized transactions should still count toward total spent
      expect(summary.totalSpent).toBe(500);
    });

    it('should handle categories without budget (null budget)', () => {
      const categoriesWithNullBudget: BudgetCategoryGroup[] = [
        {
          id: 'group-1',
          name: 'Optional',
          sortOrder: 1,
          householdId: 'hh-1',
          categories: [
            {
              id: 'cat-1',
              name: 'Misc',
              groupId: 'group-1',
              budget: null,
              isMust: false,
              sortOrder: 1,
              householdId: 'hh-1',
            },
          ],
        },
      ];

      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 500, 'cat-1'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, categoriesWithNullBudget);
      const miscCategory = summary.categoryGroups[0].categories[0];

      expect(miscCategory.budgeted).toBe(0);
      expect(miscCategory.spent).toBe(500);
      expect(miscCategory.available).toBe(-500);
    });

    it('should include transactions in category spending', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 1000, 'cat-1'),
        createTransaction('tx-2', 'expense', '2024-06-05', 500, 'cat-1'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
      const rentCategory = summary.categoryGroups[0].categories.find(
        (c) => c.categoryId === 'cat-1'
      );

      expect(rentCategory?.transactions).toHaveLength(2);
      expect(rentCategory?.transactions[0].id).toBe('tx-1');
    });

    it('should not include income in category spending', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'income', '2024-06-01', 10000, 'cat-1'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
      const rentCategory = summary.categoryGroups[0].categories.find(
        (c) => c.categoryId === 'cat-1'
      );

      expect(rentCategory?.spent).toBe(0);
      expect(rentCategory?.transactions).toHaveLength(0);
    });

    it('should calculate group totals correctly', () => {
      const transactions: BudgetTransaction[] = [
        createTransaction('tx-1', 'expense', '2024-06-01', 4000, 'cat-1'),
        createTransaction('tx-2', 'expense', '2024-06-05', 400, 'cat-2'),
      ];

      const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
      const billsGroup = summary.categoryGroups[0];

      expect(billsGroup.totalBudgeted).toBe(5500); // 5000 + 500
      expect(billsGroup.totalSpent).toBe(4400); // 4000 + 400
      expect(billsGroup.totalAvailable).toBe(1100); // 5500 - 4400
    });
  });

  describe('getPayeeName', () => {
    const mockPayees: BudgetPayee[] = [
      {
        id: 'p-1',
        name: 'Supermarket A',
        categoryId: null,
        transactionCount: 10,
        householdId: 'hh-1',
      },
      {
        id: 'p-2',
        name: 'Gas Station',
        categoryId: 'cat-1',
        transactionCount: 5,
        householdId: 'hh-1',
      },
    ];

    it('should return payee name when found', () => {
      expect(getPayeeName('p-1', mockPayees)).toBe('Supermarket A');
      expect(getPayeeName('p-2', mockPayees)).toBe('Gas Station');
    });

    it('should return "Unknown" for null payeeId', () => {
      expect(getPayeeName(null, mockPayees)).toBe('Unknown');
    });

    it('should return "Unknown" for non-existent payeeId', () => {
      expect(getPayeeName('non-existent', mockPayees)).toBe('Unknown');
    });

    it('should return "Unknown" for empty payees array', () => {
      expect(getPayeeName('p-1', [])).toBe('Unknown');
    });
  });

  describe('getCategoryName', () => {
    const mockCategoryGroups: BudgetCategoryGroup[] = [
      {
        id: 'group-1',
        name: 'Bills',
        sortOrder: 1,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-1',
            name: 'Rent',
            groupId: 'group-1',
            budget: 5000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
        ],
      },
      {
        id: 'group-2',
        name: 'Food',
        sortOrder: 2,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-2',
            name: 'Groceries',
            groupId: 'group-2',
            budget: 2000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
        ],
      },
    ];

    it('should return category name when found', () => {
      expect(getCategoryName('cat-1', mockCategoryGroups)).toBe('Rent');
      expect(getCategoryName('cat-2', mockCategoryGroups)).toBe('Groceries');
    });

    it('should return "Uncategorized" for null categoryId', () => {
      expect(getCategoryName(null, mockCategoryGroups)).toBe('Uncategorized');
    });

    it('should return "Uncategorized" for non-existent categoryId', () => {
      expect(getCategoryName('non-existent', mockCategoryGroups)).toBe('Uncategorized');
    });

    it('should return "Uncategorized" for empty groups array', () => {
      expect(getCategoryName('cat-1', [])).toBe('Uncategorized');
    });
  });

  describe('getCategoryWithGroup', () => {
    const mockCategoryGroups: BudgetCategoryGroup[] = [
      {
        id: 'group-1',
        name: 'Bills',
        sortOrder: 1,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-1',
            name: 'Rent',
            groupId: 'group-1',
            budget: 5000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
        ],
      },
      {
        id: 'group-2',
        name: 'Food',
        sortOrder: 2,
        householdId: 'hh-1',
        categories: [
          {
            id: 'cat-2',
            name: 'Groceries',
            groupId: 'group-2',
            budget: 2000,
            isMust: true,
            sortOrder: 1,
            householdId: 'hh-1',
          },
        ],
      },
    ];

    it('should return category and group names when found', () => {
      const result = getCategoryWithGroup('cat-1', mockCategoryGroups);
      expect(result).toEqual({ groupName: 'Bills', categoryName: 'Rent' });
    });

    it('should find category in second group', () => {
      const result = getCategoryWithGroup('cat-2', mockCategoryGroups);
      expect(result).toEqual({ groupName: 'Food', categoryName: 'Groceries' });
    });

    it('should return null for null categoryId', () => {
      expect(getCategoryWithGroup(null, mockCategoryGroups)).toBeNull();
    });

    it('should return null for non-existent categoryId', () => {
      expect(getCategoryWithGroup('non-existent', mockCategoryGroups)).toBeNull();
    });

    it('should return null for empty groups array', () => {
      expect(getCategoryWithGroup('cat-1', [])).toBeNull();
    });
  });

  describe('TAG_COLORS', () => {
    it('should contain exactly 12 colors', () => {
      expect(TAG_COLORS).toHaveLength(12);
    });

    it('should contain valid hex color codes', () => {
      TAG_COLORS.forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it('should have unique colors', () => {
      const uniqueColors = new Set(TAG_COLORS);
      expect(uniqueColors.size).toBe(TAG_COLORS.length);
    });
  });

  describe('Mock Data Structure Validation', () => {
    describe('MOCK_CATEGORY_GROUPS', () => {
      it('should have valid structure', () => {
        expect(MOCK_CATEGORY_GROUPS.length).toBeGreaterThan(0);
        MOCK_CATEGORY_GROUPS.forEach((group) => {
          expect(group).toHaveProperty('id');
          expect(group).toHaveProperty('name');
          expect(group).toHaveProperty('sortOrder');
          expect(group).toHaveProperty('householdId');
          expect(group).toHaveProperty('categories');
          expect(Array.isArray(group.categories)).toBe(true);
        });
      });

      it('should have valid categories within groups', () => {
        MOCK_CATEGORY_GROUPS.forEach((group) => {
          group.categories.forEach((category) => {
            expect(category).toHaveProperty('id');
            expect(category).toHaveProperty('name');
            expect(category).toHaveProperty('groupId');
            expect(category.groupId).toBe(group.id);
            expect(typeof category.isMust).toBe('boolean');
          });
        });
      });

      it('should have unique group IDs', () => {
        const ids = MOCK_CATEGORY_GROUPS.map((g) => g.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('should have unique category IDs across all groups', () => {
        const categoryIds = MOCK_CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => c.id));
        expect(new Set(categoryIds).size).toBe(categoryIds.length);
      });
    });

    describe('MOCK_PAYEES', () => {
      it('should have valid structure', () => {
        expect(MOCK_PAYEES.length).toBeGreaterThan(0);
        MOCK_PAYEES.forEach((payee) => {
          expect(payee).toHaveProperty('id');
          expect(payee).toHaveProperty('name');
          expect(payee).toHaveProperty('categoryId');
          expect(payee).toHaveProperty('transactionCount');
          expect(payee).toHaveProperty('householdId');
          expect(typeof payee.transactionCount).toBe('number');
        });
      });

      it('should have unique IDs', () => {
        const ids = MOCK_PAYEES.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('should have non-empty names', () => {
        MOCK_PAYEES.forEach((payee) => {
          expect(payee.name.length).toBeGreaterThan(0);
        });
      });
    });

    describe('MOCK_TAGS', () => {
      it('should have valid structure', () => {
        expect(MOCK_TAGS.length).toBeGreaterThan(0);
        MOCK_TAGS.forEach((tag) => {
          expect(tag).toHaveProperty('id');
          expect(tag).toHaveProperty('name');
          expect(tag).toHaveProperty('color');
          expect(tag).toHaveProperty('transactionCount');
          expect(tag).toHaveProperty('householdId');
          expect(tag.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
      });

      it('should have unique IDs', () => {
        const ids = MOCK_TAGS.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('should have unique names', () => {
        const names = MOCK_TAGS.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
      });
    });

    describe('MOCK_TRANSACTIONS', () => {
      it('should have valid structure', () => {
        expect(MOCK_TRANSACTIONS.length).toBeGreaterThan(0);
        MOCK_TRANSACTIONS.forEach((tx) => {
          expect(tx).toHaveProperty('id');
          expect(tx).toHaveProperty('type');
          expect(tx).toHaveProperty('transactionDate');
          expect(tx).toHaveProperty('amountIls');
          expect(tx).toHaveProperty('householdId');
          expect(['income', 'expense']).toContain(tx.type);
          expect(typeof tx.amountIls).toBe('number');
          expect(tx.amountIls).toBeGreaterThanOrEqual(0);
        });
      });

      it('should have unique IDs', () => {
        const ids = MOCK_TRANSACTIONS.map((tx) => tx.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('should have valid dates', () => {
        MOCK_TRANSACTIONS.forEach((tx) => {
          const date = new Date(tx.transactionDate);
          expect(date).toBeInstanceOf(Date);
          expect(isNaN(date.getTime())).toBe(false);
        });
      });

      it('should have valid payment methods', () => {
        const validMethods = ['cash', 'credit_card', 'bank_transfer', 'check', 'other'];
        MOCK_TRANSACTIONS.forEach((tx) => {
          expect(validMethods).toContain(tx.paymentMethod);
        });
      });

      it('should contain both income and expense transactions', () => {
        const incomeCount = MOCK_TRANSACTIONS.filter((tx) => tx.type === 'income').length;
        const expenseCount = MOCK_TRANSACTIONS.filter((tx) => tx.type === 'expense').length;
        expect(incomeCount).toBeGreaterThan(0);
        expect(expenseCount).toBeGreaterThan(0);
      });

      it('should have tagIds as array', () => {
        MOCK_TRANSACTIONS.forEach((tx) => {
          expect(Array.isArray(tx.tagIds)).toBe(true);
        });
      });
    });
  });

  describe('Financial Calculation Edge Cases', () => {
    describe('Decimal precision', () => {
      it('should handle floating point arithmetic correctly in calculations', () => {
        // This test ensures we dont have floating point issues
        const mockCategoryGroups: BudgetCategoryGroup[] = [
          {
            id: 'g1',
            name: 'Test',
            sortOrder: 1,
            householdId: 'hh-1',
            categories: [
              {
                id: 'c1',
                name: 'Test Cat',
                groupId: 'g1',
                budget: 100,
                isMust: false,
                sortOrder: 1,
                householdId: 'hh-1',
              },
            ],
          },
        ];

        const transactions: BudgetTransaction[] = [
          {
            id: 'tx1',
            type: 'expense',
            transactionDate: '2024-06-01',
            paymentDate: '2024-06-01',
            amountIls: 0.1,
            currency: 'ILS',
            amountOriginal: 0.1,
            categoryId: 'c1',
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
            householdId: 'hh-1',
            tagIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'tx2',
            type: 'expense',
            transactionDate: '2024-06-01',
            paymentDate: '2024-06-01',
            amountIls: 0.2,
            currency: 'ILS',
            amountOriginal: 0.2,
            categoryId: 'c1',
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
            householdId: 'hh-1',
            tagIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
        // 0.1 + 0.2 should be 0.3, not 0.30000000000000004
        expect(summary.totalSpent).toBeCloseTo(0.3, 10);
      });
    });

    describe('Zero budget scenarios', () => {
      it('should handle categories with zero budget', () => {
        const mockCategoryGroups: BudgetCategoryGroup[] = [
          {
            id: 'g1',
            name: 'Test',
            sortOrder: 1,
            householdId: 'hh-1',
            categories: [
              {
                id: 'c1',
                name: 'No Budget',
                groupId: 'g1',
                budget: 0,
                isMust: false,
                sortOrder: 1,
                householdId: 'hh-1',
              },
            ],
          },
        ];

        const transactions: BudgetTransaction[] = [
          {
            id: 'tx1',
            type: 'expense',
            transactionDate: '2024-06-01',
            paymentDate: '2024-06-01',
            amountIls: 100,
            currency: 'ILS',
            amountOriginal: 100,
            categoryId: 'c1',
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
            householdId: 'hh-1',
            tagIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);
        const category = summary.categoryGroups[0].categories[0];

        expect(category.budgeted).toBe(0);
        expect(category.spent).toBe(100);
        expect(category.available).toBe(-100);
        expect(getBudgetStatus(category.budgeted, category.spent)).toBe('overspent');
      });
    });

    describe('Large numbers', () => {
      it('should handle very large transaction amounts', () => {
        const mockCategoryGroups: BudgetCategoryGroup[] = [
          {
            id: 'g1',
            name: 'Test',
            sortOrder: 1,
            householdId: 'hh-1',
            categories: [
              {
                id: 'c1',
                name: 'Big Purchase',
                groupId: 'g1',
                budget: 10000000,
                isMust: false,
                sortOrder: 1,
                householdId: 'hh-1',
              },
            ],
          },
        ];

        const transactions: BudgetTransaction[] = [
          {
            id: 'tx1',
            type: 'expense',
            transactionDate: '2024-06-01',
            paymentDate: '2024-06-01',
            amountIls: 5000000,
            currency: 'ILS',
            amountOriginal: 5000000,
            categoryId: 'c1',
            payeeId: null,
            paymentMethod: 'bank_transfer',
            paymentNumber: null,
            totalPayments: null,
            notes: null,
            source: 'manual',
            isRecurring: false,
            isSplit: false,
            originalTransactionId: null,
            profileId: null,
            householdId: 'hh-1',
            tagIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        const summary = calculateMonthSummary('2024-06', transactions, mockCategoryGroups);

        expect(summary.totalSpent).toBe(5000000);
        expect(summary.totalBudgeted).toBe(10000000);
        expect(summary.categoryGroups[0].categories[0].available).toBe(5000000);
      });
    });
  });
});
