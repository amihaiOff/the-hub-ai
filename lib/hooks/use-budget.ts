'use client';

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetCategory,
  type BudgetPayee,
  type BudgetTag,
  type BudgetMonthSummary,
  getCurrentMonth,
} from '@/lib/utils/budget';

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Analysis response types
export interface AnalysisMonthlyTotal {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  totalBudgeted: number;
}

export interface AnalysisCategoryData {
  id: string;
  name: string;
  totalBudgeted: number;
  totalSpent: number;
  isMust: boolean;
  monthlySpent: { month: string; spent: number }[];
}

export interface AnalysisGroupData {
  id: string;
  name: string;
  sortOrder: number;
  totalBudgeted: number;
  totalSpent: number;
  monthlySpent: { month: string; spent: number }[];
  categories: AnalysisCategoryData[];
}

export interface AnalysisTagData {
  id: string;
  name: string;
  color: string;
  totalSpent: number;
  transactionCount: number;
  monthlySpent: { month: string; spent: number }[];
}

export interface AnalysisData {
  monthlyTotals: AnalysisMonthlyTotal[];
  groups: AnalysisGroupData[];
  tags: AnalysisTagData[];
}

// Query keys
export const budgetKeys = {
  all: ['budget'] as const,
  monthSummary: (month: string) => [...budgetKeys.all, 'month', month] as const,
  transactions: (filters?: TransactionFilters) =>
    [...budgetKeys.all, 'transactions', filters] as const,
  categories: () => [...budgetKeys.all, 'categories'] as const,
  categoryGroups: () => [...budgetKeys.all, 'categoryGroups'] as const,
  payees: () => [...budgetKeys.all, 'payees'] as const,
  tags: () => [...budgetKeys.all, 'tags'] as const,
  analysis: (startDate: string, endDate: string) =>
    [...budgetKeys.all, 'analysis', startDate, endDate] as const,
};

// Filter types
export interface TransactionFilters {
  month?: string;
  categoryId?: string;
  payeeId?: string;
  tagId?: string;
  type?: 'income' | 'expense';
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}

// API helper function
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data as T;
}

// Hooks

/**
 * Hook to manage current selected month
 */
export function useSelectedMonth() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  return { selectedMonth, setSelectedMonth };
}

/**
 * Hook to fetch budget summary for a specific month
 */
export function useBudgetMonthSummary(month: string) {
  return useQuery({
    queryKey: budgetKeys.monthSummary(month),
    queryFn: async (): Promise<BudgetMonthSummary> => {
      return fetchApi<BudgetMonthSummary>(`/api/budget/summary?month=${month}`);
    },
  });
}

/**
 * Hook to fetch all transactions with optional filters
 */
export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: budgetKeys.transactions(filters),
    queryFn: async (): Promise<BudgetTransaction[]> => {
      const params = new URLSearchParams();

      if (filters?.month) params.set('month', filters.month);
      if (filters?.categoryId) params.set('categoryId', filters.categoryId);
      if (filters?.payeeId) params.set('payeeId', filters.payeeId);
      if (filters?.tagId) params.set('tagIds', filters.tagId);
      if (filters?.type) params.set('type', filters.type);
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);

      const response = await fetchApi<PaginatedResponse<BudgetTransaction>>(
        `/api/budget/transactions?${params.toString()}`
      );

      // If search query provided, filter on client side (payee name search)
      let result = response.items;
      if (filters?.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter(
          (tx) =>
            tx.notes?.toLowerCase().includes(query) ||
            (tx as BudgetTransaction & { payeeName?: string }).payeeName
              ?.toLowerCase()
              .includes(query)
        );
      }

      return result;
    },
  });
}

/**
 * Hook to fetch transactions with infinite scroll pagination
 */
export function useTransactionsPaginated(filters?: TransactionFilters) {
  const PAGE_SIZE = 100;

  const infiniteQuery = useInfiniteQuery({
    queryKey: [...budgetKeys.transactions(filters), 'paginated'],
    queryFn: async ({ pageParam = 0 }): Promise<PaginatedResponse<BudgetTransaction>> => {
      const params = new URLSearchParams();

      if (filters?.month) params.set('month', filters.month);
      if (filters?.categoryId) params.set('categoryId', filters.categoryId);
      if (filters?.payeeId) params.set('payeeId', filters.payeeId);
      if (filters?.tagId) params.set('tagIds', filters.tagId);
      if (filters?.type) params.set('type', filters.type);
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam));

      return fetchApi<PaginatedResponse<BudgetTransaction>>(
        `/api/budget/transactions?${params.toString()}`
      );
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.offset + lastPage.pagination.limit
        : undefined,
  });

  let allTransactions: BudgetTransaction[] = [];
  if (infiniteQuery.data) {
    allTransactions = infiniteQuery.data.pages.flatMap((page) => page.items);

    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      allTransactions = allTransactions.filter(
        (tx) =>
          tx.notes?.toLowerCase().includes(query) ||
          (tx as BudgetTransaction & { payeeName?: string }).payeeName
            ?.toLowerCase()
            .includes(query)
      );
    }
  }

  const total = infiniteQuery.data?.pages[0]?.pagination.total ?? 0;

  return {
    transactions: allTransactions,
    total,
    hasMore: infiniteQuery.hasNextPage ?? false,
    loadMore: infiniteQuery.fetchNextPage,
    isLoading: infiniteQuery.isLoading,
    isLoadingMore: infiniteQuery.isFetchingNextPage,
    error: infiniteQuery.error,
  };
}

/**
 * Hook to fetch category groups with categories
 */
export function useCategoryGroups() {
  return useQuery({
    queryKey: budgetKeys.categoryGroups(),
    queryFn: async (): Promise<BudgetCategoryGroup[]> => {
      return fetchApi<BudgetCategoryGroup[]>('/api/budget/category-groups');
    },
  });
}

/**
 * Hook to fetch payees
 */
export function usePayees() {
  return useQuery({
    queryKey: budgetKeys.payees(),
    queryFn: async (): Promise<BudgetPayee[]> => {
      return fetchApi<BudgetPayee[]>('/api/budget/payees');
    },
  });
}

/**
 * Hook to fetch tags
 */
export function useTags() {
  return useQuery({
    queryKey: budgetKeys.tags(),
    queryFn: async (): Promise<BudgetTag[]> => {
      return fetchApi<BudgetTag[]>('/api/budget/tags');
    },
  });
}

/**
 * Hook to fetch budget analysis data for a date range
 */
export function useBudgetAnalysis(startDate: string, endDate: string) {
  return useQuery({
    queryKey: budgetKeys.analysis(startDate, endDate),
    queryFn: async (): Promise<AnalysisData> => {
      return fetchApi<AnalysisData>(
        `/api/budget/analysis?startDate=${startDate}&endDate=${endDate}`
      );
    },
  });
}

// Mutation types
interface CreateTransactionInput {
  type: 'income' | 'expense';
  transactionDate: string;
  amountIls: number;
  categoryId?: string | null;
  payeeId?: string | null;
  notes?: string | null;
  tagIds?: string[];
  paymentMethod?: string;
}

interface UpdateTransactionInput {
  id: string;
  type?: 'income' | 'expense';
  transactionDate?: string;
  amountIls?: number;
  categoryId?: string | null;
  payeeId?: string | null;
  notes?: string | null;
  tagIds?: string[];
}

interface CreateCategoryInput {
  name: string;
  groupId: string;
  budget?: number | null;
  isMust?: boolean;
}

interface UpdateCategoryInput {
  id: string;
  name?: string;
  budget?: number | null;
  isMust?: boolean;
}

interface CreateCategoryGroupInput {
  name: string;
}

interface CreatePayeeInput {
  name: string;
  categoryId?: string | null;
}

interface UpdatePayeeInput {
  id: string;
  name?: string;
  categoryId?: string | null;
  recategorizeTransactions?: boolean;
}

interface CreateTagInput {
  name: string;
  color: string;
}

interface UpdateTagInput {
  id: string;
  name?: string;
  color?: string;
}

interface MergeTagsInput {
  sourceTagIds: string[];
  targetTagId: string;
}

// Transaction mutations
export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTransactionInput): Promise<BudgetTransaction> => {
      return fetchApi<BudgetTransaction>('/api/budget/transactions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTransactionInput): Promise<BudgetTransaction> => {
      const { id, ...data } = input;
      return fetchApi<BudgetTransaction>(`/api/budget/transactions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/transactions/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useBulkDeleteTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      await fetchApi<{ deleted: number }>('/api/budget/transactions/bulk', {
        method: 'DELETE',
        body: JSON.stringify({ transactionIds: ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useBulkCategorizeTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      categoryId,
    }: {
      ids: string[];
      categoryId: string;
    }): Promise<void> => {
      await fetchApi<{ updated: number }>('/api/budget/transactions/bulk', {
        method: 'PUT',
        body: JSON.stringify({ transactionIds: ids, categoryId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

// Category mutations
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCategoryInput): Promise<BudgetCategory> => {
      return fetchApi<BudgetCategory>('/api/budget/categories', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCategoryInput): Promise<BudgetCategory> => {
      const { id, ...data } = input;
      return fetchApi<BudgetCategory>(`/api/budget/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/categories/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

// Category Group mutations
export function useCreateCategoryGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCategoryGroupInput): Promise<BudgetCategoryGroup> => {
      return fetchApi<BudgetCategoryGroup>('/api/budget/category-groups', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeleteCategoryGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/category-groups/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useReorderCategoryGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groups: { id: string; sortOrder: number }[]): Promise<void> => {
      await fetchApi<BudgetCategoryGroup[]>('/api/budget/category-groups/reorder', {
        method: 'POST',
        body: JSON.stringify({ groups }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

// Payee mutations
export function useCreatePayee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePayeeInput): Promise<BudgetPayee> => {
      return fetchApi<BudgetPayee>('/api/budget/payees', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useUpdatePayee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePayeeInput): Promise<BudgetPayee> => {
      const { id, ...data } = input;
      return fetchApi<BudgetPayee>(`/api/budget/payees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeletePayee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/payees/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

// Tag mutations
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTagInput): Promise<BudgetTag> => {
      return fetchApi<BudgetTag>('/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTagInput): Promise<BudgetTag> => {
      const { id, ...data } = input;
      return fetchApi<BudgetTag>(`/api/budget/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/tags/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useMergeTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MergeTagsInput): Promise<void> => {
      await fetchApi<{ id: string }>('/api/budget/tags', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

// Riseup category types and hooks
export interface RiseupCategory {
  id: string;
  name: string;
  isDeleted: boolean;
  budgetCategoryId: string | null;
  householdId: string;
}

export const riseupCategoryKeys = {
  all: ['riseupCategories'] as const,
};

export function useRiseupCategories() {
  return useQuery({
    queryKey: riseupCategoryKeys.all,
    queryFn: async (): Promise<RiseupCategory[]> => {
      return fetchApi<RiseupCategory[]>('/api/budget/riseup-categories');
    },
  });
}

export function useUpdateRiseupCategoryMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      budgetCategoryId,
    }: {
      id: string;
      budgetCategoryId: string | null;
    }): Promise<RiseupCategory> => {
      return fetchApi<RiseupCategory>('/api/budget/riseup-categories', {
        method: 'PUT',
        body: JSON.stringify({ id, budgetCategoryId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: riseupCategoryKeys.all });
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useCreateRiseupCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryNames: string[]): Promise<{ created: number; existing: number }> => {
      return fetchApi<{ created: number; existing: number }>('/api/budget/riseup-categories', {
        method: 'POST',
        body: JSON.stringify({ categoryNames }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: riseupCategoryKeys.all });
    },
  });
}

export function useDeleteRiseupCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<RiseupCategory> => {
      return fetchApi<RiseupCategory>('/api/budget/riseup-categories', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: riseupCategoryKeys.all });
    },
  });
}

// Import mutations
interface ImportTransactionsInput {
  transactions: {
    type: 'income' | 'expense';
    transactionDate: string;
    paymentDate?: string | null;
    amountIls: number;
    currency?: string;
    amountOriginal?: number;
    payeeName: string;
    riseupCategory?: string | null;
    paymentMethod?: string;
    paymentNumber?: number | null;
    totalPayments?: number | null;
    notes?: string | null;
    source?: string;
    paymentIdentifier?: string | null;
    excludedFromFlow?: boolean;
  }[];
}

interface ImportResult {
  created: number;
  duplicatesSkipped: number;
  payeesCreated: string[];
}

export function useImportTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImportTransactionsInput): Promise<ImportResult> => {
      return fetchApi<ImportResult>('/api/budget/transactions/import', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
      queryClient.invalidateQueries({ queryKey: riseupCategoryKeys.all });
    },
  });
}

// Utility hook for expanded state management
export function useExpandedGroups() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const isGroupExpanded = useCallback(
    (groupId: string) => expandedGroups.has(groupId),
    [expandedGroups]
  );

  const expandAll = useCallback((groupIds: string[]) => {
    setExpandedGroups(new Set(groupIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  return { expandedGroups, toggleGroup, isGroupExpanded, expandAll, collapseAll };
}

// Utility hook for expanded category rows (to show mini transactions)
export function useExpandedCategories() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const isCategoryExpanded = useCallback(
    (categoryId: string) => expandedCategories.has(categoryId),
    [expandedCategories]
  );

  return { expandedCategories, toggleCategory, isCategoryExpanded };
}
