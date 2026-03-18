/**
 * Unit tests for budget hooks
 * Tests query and mutation hook configurations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  budgetKeys,
  useSelectedMonth,
  useBudgetMonthSummary,
  useTransactions,
  useCategoryGroups,
  usePayees,
  useTags,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useBulkDeleteTransactions,
  useBulkCategorizeTransactions,
  useUpdateCategory,
  useDeleteCategory,
  useExpandedGroups,
  useExpandedCategories,
  useUncategorizedCount,
  riseupCategoryKeys,
  useRiseupCategories,
  useCreateRiseupCategories,
  useDeleteRiseupCategory,
  useSavings,
  useAddSavingsEntry,
} from '../use-budget';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock getCurrentMonth
jest.mock('@/lib/utils/budget', () => ({
  getCurrentMonth: jest.fn(() => '2024-06'),
}));

// Helper to create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('Budget Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('budgetKeys', () => {
    it('should generate correct base key', () => {
      expect(budgetKeys.all).toEqual(['budget']);
    });

    it('should generate correct monthSummary key', () => {
      expect(budgetKeys.monthSummary('2024-06')).toEqual(['budget', 'month', '2024-06']);
    });

    it('should generate correct allTransactions key for invalidation', () => {
      expect(budgetKeys.allTransactions()).toEqual(['budget', 'transactions']);
    });

    it('should generate correct transactions key with filters', () => {
      const filters = { month: '2024-06', categoryId: 'cat-1' };
      expect(budgetKeys.transactions(filters)).toEqual(['budget', 'transactions', filters]);
    });

    it('should generate correct categories key', () => {
      expect(budgetKeys.categories()).toEqual(['budget', 'categories']);
    });

    it('should generate correct categoryGroups key', () => {
      expect(budgetKeys.categoryGroups()).toEqual(['budget', 'categoryGroups']);
    });

    it('should generate correct payees key', () => {
      expect(budgetKeys.payees()).toEqual(['budget', 'payees']);
    });

    it('should generate correct tags key', () => {
      expect(budgetKeys.tags()).toEqual(['budget', 'tags']);
    });

    it('should generate correct uncategorizedCount keys', () => {
      expect(budgetKeys.allUncategorizedCounts()).toEqual(['budget', 'uncategorizedCount']);
      expect(budgetKeys.uncategorizedCount('2026-03')).toEqual([
        'budget',
        'uncategorizedCount',
        '2026-03',
      ]);
    });

    it('should generate correct savings key', () => {
      expect(budgetKeys.savings()).toEqual(['budget', 'savings']);
    });
  });

  describe('useSelectedMonth', () => {
    it('should initialize with current month', () => {
      const { result } = renderHook(() => useSelectedMonth());
      expect(result.current.selectedMonth).toBe('2024-06');
    });

    it('should update selected month', () => {
      const { result } = renderHook(() => useSelectedMonth());
      act(() => {
        result.current.setSelectedMonth('2024-07');
      });
      expect(result.current.selectedMonth).toBe('2024-07');
    });
  });

  describe('useBudgetMonthSummary', () => {
    it('should fetch month summary successfully', async () => {
      const mockSummary = {
        month: '2024-06',
        totalBudgeted: 10000,
        totalSpent: 5000,
        totalIncome: 15000,
        categoryGroups: [],
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSummary }),
      });

      const { result } = renderHook(() => useBudgetMonthSummary('2024-06'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSummary);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/summary?month=2024-06',
        expect.any(Object)
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Failed to fetch' }),
      });

      const { result } = renderHook(() => useBudgetMonthSummary('2024-06'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useTransactions', () => {
    it('should fetch transactions with filters', async () => {
      const mockTransactions = {
        items: [{ id: 'tx-1', amountIls: 100 }],
        pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions({ month: '2024-06' }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockTransactions.items);
    });

    it('should pass uncategorized=true param when filter is set', async () => {
      const mockTransactions = {
        items: [{ id: 'tx-1', amountIls: 100 }],
        pagination: { total: 1, limit: 1000, offset: 0, hasMore: false },
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions({ uncategorized: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('uncategorized=true'),
        expect.any(Object)
      );
    });

    it('should not pass uncategorized param when filter is false or undefined', async () => {
      const mockTransactions = {
        items: [],
        pagination: { total: 0, limit: 1000, offset: 0, hasMore: false },
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions({ uncategorized: false }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).not.toContain('uncategorized');
    });

    it('should combine uncategorized with month filter', async () => {
      const mockTransactions = {
        items: [],
        pagination: { total: 0, limit: 1000, offset: 0, hasMore: false },
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransactions }),
      });

      const { result } = renderHook(
        () => useTransactions({ month: '2024-06', uncategorized: true }),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('month=2024-06');
      expect(fetchUrl).toContain('uncategorized=true');
    });

    it('should apply client-side search filtering', async () => {
      const mockTransactions = {
        items: [
          { id: 'tx-1', amountIls: 100, notes: 'Groceries from store' },
          { id: 'tx-2', amountIls: 200, notes: 'Gas station' },
        ],
        pagination: { total: 2, limit: 50, offset: 0, hasMore: false },
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransactions }),
      });

      const { result } = renderHook(() => useTransactions({ searchQuery: 'groceries' }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].id).toBe('tx-1');
    });
  });

  describe('useCategoryGroups', () => {
    it('should fetch category groups', async () => {
      const mockGroups = [{ id: 'group-1', name: 'Bills', categories: [] }];
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockGroups }),
      });

      const { result } = renderHook(() => useCategoryGroups(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockGroups);
    });
  });

  describe('usePayees', () => {
    it('should fetch payees', async () => {
      const mockPayees = [{ id: 'payee-1', name: 'Store' }];
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockPayees }),
      });

      const { result } = renderHook(() => usePayees(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockPayees);
    });
  });

  describe('useTags', () => {
    it('should fetch tags', async () => {
      const mockTags = [{ id: 'tag-1', name: 'Essential', color: '#EF4444' }];
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTags }),
      });

      const { result } = renderHook(() => useTags(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockTags);
    });
  });

  describe('useCreateTransaction', () => {
    it('should create a transaction', async () => {
      const mockTransaction = { id: 'tx-new', amountIls: 500 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockTransaction }),
      });

      const { result } = renderHook(() => useCreateTransaction(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        type: 'expense',
        transactionDate: '2024-06-15',
        amountIls: 500,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockTransaction);
    });
  });

  describe('useUpdateTransaction', () => {
    it('should update a transaction', async () => {
      const mockUpdatedTransaction = { id: 'tx-1', amountIls: 150, categoryId: 'cat-2' };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockUpdatedTransaction }),
      });

      const { result } = renderHook(() => useUpdateTransaction(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: 'tx-1',
        categoryId: 'cat-2',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockUpdatedTransaction);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/tx-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ categoryId: 'cat-2' }),
        })
      );
    });

    it('should update transaction with null categoryId', async () => {
      const mockUpdatedTransaction = { id: 'tx-1', amountIls: 100, categoryId: null };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockUpdatedTransaction }),
      });

      const { result } = renderHook(() => useUpdateTransaction(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: 'tx-1',
        categoryId: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/tx-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ categoryId: null }),
        })
      );
    });

    it('should handle update error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Transaction not found' }),
      });

      const { result } = renderHook(() => useUpdateTransaction(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: 'invalid-tx',
        categoryId: 'cat-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useDeleteTransaction', () => {
    it('should delete a transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { id: 'tx-1' } }),
      });

      const { result } = renderHook(() => useDeleteTransaction(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('tx-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/tx-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('useBulkDeleteTransactions', () => {
    it('should delete multiple transactions', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { deleted: 3 } }),
      });

      const { result } = renderHook(() => useBulkDeleteTransactions(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(['tx-1', 'tx-2', 'tx-3']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/bulk',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ transactionIds: ['tx-1', 'tx-2', 'tx-3'] }),
        })
      );
    });
  });

  describe('useBulkCategorizeTransactions', () => {
    it('should categorize multiple transactions', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { updated: 3 } }),
      });

      const { result } = renderHook(() => useBulkCategorizeTransactions(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ ids: ['tx-1', 'tx-2', 'tx-3'], categoryId: 'cat-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/bulk',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ transactionIds: ['tx-1', 'tx-2', 'tx-3'], categoryId: 'cat-1' }),
        })
      );
    });
  });

  describe('useUpdateCategory', () => {
    it('should update category isMust field only (toggle essential)', async () => {
      const mockUpdatedCategory = { id: 'cat-1', name: 'Groceries', budget: 1000, isMust: true };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockUpdatedCategory }),
      });

      const { result } = renderHook(() => useUpdateCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'cat-1', isMust: true });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockUpdatedCategory);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories/cat-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ isMust: true }),
        })
      );
    });

    it('should update category budget only (inline budget edit)', async () => {
      const mockUpdatedCategory = { id: 'cat-1', name: 'Groceries', budget: 2500, isMust: true };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockUpdatedCategory }),
      });

      const { result } = renderHook(() => useUpdateCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'cat-1', budget: 2500 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories/cat-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ budget: 2500 }),
        })
      );
    });

    it('should clear budget to null (inline budget edit with empty value)', async () => {
      const mockUpdatedCategory = { id: 'cat-1', name: 'Groceries', budget: null, isMust: false };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockUpdatedCategory }),
      });

      const { result } = renderHook(() => useUpdateCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'cat-1', budget: null });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories/cat-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ budget: null }),
        })
      );
    });

    it('should handle update error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Category not found' }),
      });

      const { result } = renderHook(() => useUpdateCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'invalid-cat', isMust: true });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useDeleteCategory', () => {
    it('should delete a category', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { id: 'cat-1' } }),
      });

      const { result } = renderHook(() => useDeleteCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('cat-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories/cat-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('useUncategorizedCount', () => {
    it('should fetch uncategorized count successfully', async () => {
      const mockCountData = { uncategorized: 15 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockCountData }),
      });

      const { result } = renderHook(() => useUncategorizedCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ uncategorized: 15 });
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/transactions/counts', expect.any(Object));
    });

    it('should return zero uncategorized count', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { uncategorized: 0 } }),
      });

      const { result } = renderHook(() => useUncategorizedCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ uncategorized: 0 });
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Failed to fetch counts' }),
      });

      const { result } = renderHook(() => useUncategorizedCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('should pass month query param when provided', async () => {
      const mockCountData = { uncategorized: 3 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockCountData }),
      });

      const { result } = renderHook(() => useUncategorizedCount('2026-03'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ uncategorized: 3 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/counts?month=2026-03',
        expect.any(Object)
      );
    });
  });

  describe('useExpandedGroups', () => {
    it('should start with no expanded groups', () => {
      const { result } = renderHook(() => useExpandedGroups());
      expect(result.current.expandedGroups.size).toBe(0);
    });

    it('should toggle group expansion', () => {
      const { result } = renderHook(() => useExpandedGroups());

      act(() => {
        result.current.toggleGroup('group-1');
      });
      expect(result.current.isGroupExpanded('group-1')).toBe(true);

      act(() => {
        result.current.toggleGroup('group-1');
      });
      expect(result.current.isGroupExpanded('group-1')).toBe(false);
    });

    it('should expand all groups', () => {
      const { result } = renderHook(() => useExpandedGroups());

      act(() => {
        result.current.expandAll(['group-1', 'group-2', 'group-3']);
      });

      expect(result.current.isGroupExpanded('group-1')).toBe(true);
      expect(result.current.isGroupExpanded('group-2')).toBe(true);
      expect(result.current.isGroupExpanded('group-3')).toBe(true);
    });

    it('should collapse all groups', () => {
      const { result } = renderHook(() => useExpandedGroups());

      act(() => {
        result.current.expandAll(['group-1', 'group-2']);
      });
      act(() => {
        result.current.collapseAll();
      });

      expect(result.current.expandedGroups.size).toBe(0);
    });
  });

  describe('useExpandedCategories', () => {
    it('should start with no expanded categories', () => {
      const { result } = renderHook(() => useExpandedCategories());
      expect(result.current.expandedCategories.size).toBe(0);
    });

    it('should toggle category expansion', () => {
      const { result } = renderHook(() => useExpandedCategories());

      act(() => {
        result.current.toggleCategory('cat-1');
      });
      expect(result.current.isCategoryExpanded('cat-1')).toBe(true);

      act(() => {
        result.current.toggleCategory('cat-1');
      });
      expect(result.current.isCategoryExpanded('cat-1')).toBe(false);
    });

    it('should handle multiple categories independently', () => {
      const { result } = renderHook(() => useExpandedCategories());

      act(() => {
        result.current.toggleCategory('cat-1');
      });
      act(() => {
        result.current.toggleCategory('cat-2');
      });

      expect(result.current.isCategoryExpanded('cat-1')).toBe(true);
      expect(result.current.isCategoryExpanded('cat-2')).toBe(true);
      expect(result.current.isCategoryExpanded('cat-3')).toBe(false);
    });
  });

  describe('riseupCategoryKeys', () => {
    it('should generate correct base key', () => {
      expect(riseupCategoryKeys.all).toEqual(['riseupCategories']);
    });
  });

  describe('useRiseupCategories', () => {
    it('should fetch riseup categories', async () => {
      const mockCategories = [
        { id: 'rc-1', name: 'Food', isDeleted: false, budgetCategoryId: null, householdId: 'h-1' },
      ];
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockCategories }),
      });

      const { result } = renderHook(() => useRiseupCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockCategories);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/riseup-categories', expect.any(Object));
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Failed to fetch' }),
      });

      const { result } = renderHook(() => useRiseupCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useCreateRiseupCategories', () => {
    it('should send POST request with category names', async () => {
      const mockResult = { created: 3, existing: 1 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      });

      const { result } = renderHook(() => useCreateRiseupCategories(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(['Food', 'Transport', 'Entertainment', 'Bills']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/riseup-categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ categoryNames: ['Food', 'Transport', 'Entertainment', 'Bills'] }),
        })
      );
    });

    it('should handle error when creating categories fails', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Failed to create' }),
      });

      const { result } = renderHook(() => useCreateRiseupCategories(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(['Food']);

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('should return created and existing counts', async () => {
      const mockResult = { created: 0, existing: 5 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      });

      const { result } = renderHook(() => useCreateRiseupCategories(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(['A', 'B', 'C', 'D', 'E']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.created).toBe(0);
      expect(result.current.data?.existing).toBe(5);
    });
  });

  describe('useDeleteRiseupCategory', () => {
    it('should send DELETE request with category id', async () => {
      const mockDeleted = {
        id: 'rc-1',
        name: 'Food',
        isDeleted: true,
        budgetCategoryId: null,
        householdId: 'h-1',
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockDeleted }),
      });

      const { result } = renderHook(() => useDeleteRiseupCategory(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('rc-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockDeleted);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/riseup-categories',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ id: 'rc-1' }),
        })
      );
    });
  });

  describe('useSavings', () => {
    it('should fetch savings data successfully', async () => {
      const mockSavingsData = {
        categoryId: 'cat-savings-1',
        years: [
          {
            year: 2025,
            total: 5000,
            months: [
              { month: '2025-01', amount: 2000 },
              { month: '2025-02', amount: 1500 },
              { month: '2025-03', amount: 1500 },
            ],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockSavingsData }),
      });

      const { result } = renderHook(() => useSavings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSavingsData);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/savings', expect.any(Object));
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Failed to fetch savings' }),
      });

      const { result } = renderHook(() => useSavings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('should return empty years array when no savings data', async () => {
      const mockEmptyData = { categoryId: 'cat-savings-1', years: [] };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockEmptyData }),
      });

      const { result } = renderHook(() => useSavings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.years).toEqual([]);
    });
  });

  describe('useAddSavingsEntry', () => {
    it('should create a savings entry with month and amount', async () => {
      const mockResult = { id: 'tx-new', month: '2025-03', amount: 3000 };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      });

      const { result } = renderHook(() => useAddSavingsEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ month: '2025-03', amount: 3000 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/savings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ month: '2025-03', amount: 3000 }),
        })
      );
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Validation failed' }),
      });

      const { result } = renderHook(() => useAddSavingsEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ month: '2025-03', amount: -100 });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
