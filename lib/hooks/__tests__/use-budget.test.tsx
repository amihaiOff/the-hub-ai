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
  useExpandedGroups,
  useExpandedCategories,
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

    it('should generate correct transactions key without filters', () => {
      expect(budgetKeys.transactions()).toEqual(['budget', 'transactions', undefined]);
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
});
