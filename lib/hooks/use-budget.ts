'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetCategory,
  type BudgetPayee,
  type BudgetTag,
  type BudgetMonthSummary,
  MOCK_TRANSACTIONS,
  MOCK_CATEGORY_GROUPS,
  MOCK_PAYEES,
  MOCK_TAGS,
  calculateMonthSummary,
  getCurrentMonth,
} from '@/lib/utils/budget';

// Simulate API delay for realistic UX
const simulateDelay = (ms: number = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * DEVELOPMENT MOCK STATE
 * ----------------------
 * These module-level variables serve as in-memory storage for the mock implementation.
 * This is intentional for the frontend-only development phase.
 *
 * TODO: Replace with real API calls when backend is implemented:
 * - Replace mockTransactions with API calls to /api/budget/transactions
 * - Replace mockCategoryGroups with API calls to /api/budget/categories
 * - Replace mockPayees with API calls to /api/budget/payees
 * - Replace mockTags with API calls to /api/budget/tags
 *
 * WARNING: This state persists across component remounts but resets on page refresh.
 * In production, all mutations should call the actual backend API.
 */
let mockTransactions = [...MOCK_TRANSACTIONS];
let mockCategoryGroups = [...MOCK_CATEGORY_GROUPS];
let mockPayees = [...MOCK_PAYEES];
let mockTags = [...MOCK_TAGS];

// Query keys
export const budgetKeys = {
  all: ['budget'] as const,
  monthSummary: (month: string) => [...budgetKeys.all, 'month', month] as const,
  transactions: (filters?: TransactionFilters) =>
    [...budgetKeys.all, 'transactions', filters] as const,
  categories: () => [...budgetKeys.all, 'categories'] as const,
  payees: () => [...budgetKeys.all, 'payees'] as const,
  tags: () => [...budgetKeys.all, 'tags'] as const,
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
      await simulateDelay();
      return calculateMonthSummary(month, mockTransactions, mockCategoryGroups);
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
      await simulateDelay();
      let result = [...mockTransactions];

      if (filters?.month) {
        result = result.filter((tx) => tx.transactionDate.startsWith(filters.month!));
      }
      if (filters?.categoryId) {
        result = result.filter((tx) => tx.categoryId === filters.categoryId);
      }
      if (filters?.payeeId) {
        result = result.filter((tx) => tx.payeeId === filters.payeeId);
      }
      if (filters?.tagId) {
        result = result.filter((tx) => tx.tagIds.includes(filters.tagId!));
      }
      if (filters?.type) {
        result = result.filter((tx) => tx.type === filters.type);
      }
      if (filters?.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        result = result.filter(
          (tx) =>
            tx.notes?.toLowerCase().includes(query) ||
            mockPayees
              .find((p) => p.id === tx.payeeId)
              ?.name.toLowerCase()
              .includes(query)
        );
      }
      if (filters?.startDate) {
        result = result.filter((tx) => tx.transactionDate >= filters.startDate!);
      }
      if (filters?.endDate) {
        result = result.filter((tx) => tx.transactionDate <= filters.endDate!);
      }

      // Sort by date descending
      return result.sort(
        (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
    },
  });
}

/**
 * Hook to fetch category groups with categories
 */
export function useCategoryGroups() {
  return useQuery({
    queryKey: budgetKeys.categories(),
    queryFn: async (): Promise<BudgetCategoryGroup[]> => {
      await simulateDelay();
      return mockCategoryGroups;
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
      await simulateDelay();
      return mockPayees;
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
      await simulateDelay();
      return mockTags;
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
      await simulateDelay();
      const newTx: BudgetTransaction = {
        id: `tx-${Date.now()}`,
        type: input.type,
        transactionDate: input.transactionDate,
        paymentDate: input.transactionDate,
        amountIls: input.amountIls,
        currency: 'ILS',
        amountOriginal: input.amountIls,
        categoryId: input.categoryId || null,
        payeeId: input.payeeId || null,
        paymentMethod:
          (input.paymentMethod as 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'other') ||
          'credit_card',
        paymentNumber: null,
        totalPayments: null,
        notes: input.notes || null,
        source: 'manual',
        isRecurring: false,
        isSplit: false,
        originalTransactionId: null,
        profileId: null,
        householdId: 'mock-household-1',
        tagIds: input.tagIds || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTransactions = [...mockTransactions, newTx];
      return newTx;
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
      await simulateDelay();
      const index = mockTransactions.findIndex((tx) => tx.id === input.id);
      if (index === -1) throw new Error('Transaction not found');

      const updated = {
        ...mockTransactions[index],
        ...input,
        updatedAt: new Date().toISOString(),
      };
      mockTransactions = [
        ...mockTransactions.slice(0, index),
        updated,
        ...mockTransactions.slice(index + 1),
      ];
      return updated;
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
      await simulateDelay();
      mockTransactions = mockTransactions.filter((tx) => tx.id !== id);
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
      await simulateDelay();
      mockTransactions = mockTransactions.filter((tx) => !ids.includes(tx.id));
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
      await simulateDelay();
      mockTransactions = mockTransactions.map((tx) =>
        ids.includes(tx.id) ? { ...tx, categoryId, updatedAt: new Date().toISOString() } : tx
      );
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
      await simulateDelay();
      const group = mockCategoryGroups.find((g) => g.id === input.groupId);
      if (!group) throw new Error('Category group not found');

      const newCategory: BudgetCategory = {
        id: `cat-${Date.now()}`,
        name: input.name,
        groupId: input.groupId,
        budget: input.budget || null,
        isMust: input.isMust || false,
        sortOrder: group.categories.length + 1,
        householdId: 'mock-household-1',
      };

      mockCategoryGroups = mockCategoryGroups.map((g) =>
        g.id === input.groupId ? { ...g, categories: [...g.categories, newCategory] } : g
      );
      return newCategory;
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
      await simulateDelay();
      let updated: BudgetCategory | null = null;

      mockCategoryGroups = mockCategoryGroups.map((g) => ({
        ...g,
        categories: g.categories.map((c) => {
          if (c.id === input.id) {
            updated = { ...c, ...input };
            return updated;
          }
          return c;
        }),
      }));

      if (!updated) throw new Error('Category not found');
      return updated;
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
      await simulateDelay();
      mockCategoryGroups = mockCategoryGroups.map((g) => ({
        ...g,
        categories: g.categories.filter((c) => c.id !== id),
      }));
      // Also uncategorize any transactions with this category
      mockTransactions = mockTransactions.map((tx) =>
        tx.categoryId === id ? { ...tx, categoryId: null } : tx
      );
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
      await simulateDelay();
      const newGroup: BudgetCategoryGroup = {
        id: `group-${Date.now()}`,
        name: input.name,
        sortOrder: mockCategoryGroups.length + 1,
        householdId: 'mock-household-1',
        categories: [],
      };
      mockCategoryGroups = [...mockCategoryGroups, newGroup];
      return newGroup;
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
      await simulateDelay();
      const group = mockCategoryGroups.find((g) => g.id === id);
      if (group) {
        // Uncategorize transactions in this group's categories
        const categoryIds = group.categories.map((c) => c.id);
        mockTransactions = mockTransactions.map((tx) =>
          tx.categoryId && categoryIds.includes(tx.categoryId) ? { ...tx, categoryId: null } : tx
        );
      }
      mockCategoryGroups = mockCategoryGroups.filter((g) => g.id !== id);
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
      await simulateDelay();
      const newPayee: BudgetPayee = {
        id: `payee-${Date.now()}`,
        name: input.name,
        categoryId: input.categoryId || null,
        transactionCount: 0,
        householdId: 'mock-household-1',
      };
      mockPayees = [...mockPayees, newPayee];
      return newPayee;
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
      await simulateDelay();
      const index = mockPayees.findIndex((p) => p.id === input.id);
      if (index === -1) throw new Error('Payee not found');

      const updated = { ...mockPayees[index], ...input };
      mockPayees = [...mockPayees.slice(0, index), updated, ...mockPayees.slice(index + 1)];
      return updated;
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
      await simulateDelay();
      mockPayees = mockPayees.filter((p) => p.id !== id);
      // Clear payee from transactions
      mockTransactions = mockTransactions.map((tx) =>
        tx.payeeId === id ? { ...tx, payeeId: null } : tx
      );
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
      await simulateDelay();
      const newTag: BudgetTag = {
        id: `tag-${Date.now()}`,
        name: input.name,
        color: input.color,
        transactionCount: 0,
        householdId: 'mock-household-1',
      };
      mockTags = [...mockTags, newTag];
      return newTag;
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
      await simulateDelay();
      const index = mockTags.findIndex((t) => t.id === input.id);
      if (index === -1) throw new Error('Tag not found');

      const updated = { ...mockTags[index], ...input };
      mockTags = [...mockTags.slice(0, index), updated, ...mockTags.slice(index + 1)];
      return updated;
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
      await simulateDelay();
      mockTags = mockTags.filter((t) => t.id !== id);
      // Remove tag from transactions
      mockTransactions = mockTransactions.map((tx) => ({
        ...tx,
        tagIds: tx.tagIds.filter((tagId) => tagId !== id),
      }));
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
      await simulateDelay();
      // Update all transactions to use target tag instead of source tags
      mockTransactions = mockTransactions.map((tx) => {
        const hasSourceTag = tx.tagIds.some((id) => input.sourceTagIds.includes(id));
        if (hasSourceTag) {
          const newTagIds = tx.tagIds.filter((id) => !input.sourceTagIds.includes(id));
          if (!newTagIds.includes(input.targetTagId)) {
            newTagIds.push(input.targetTagId);
          }
          return { ...tx, tagIds: newTagIds };
        }
        return tx;
      });
      // Delete source tags
      mockTags = mockTags.filter((t) => !input.sourceTagIds.includes(t.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
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
