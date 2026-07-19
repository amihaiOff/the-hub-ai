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
  type PayeeCategoryRule,
} from '@/lib/utils/budget';
import { getCurrentCycleMonth } from '@/lib/utils/billing-cycle';

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

export interface AnalysisInstitutionData {
  /**
   * Stable id for the institution row. Payment identifiers are used verbatim
   * so grouping matches the source-of-truth column on BudgetTransaction; the
   * unmapped `credit_card` / `bank_transfer` buckets fall back to synthetic
   * `unmapped:<method>` ids.
   */
  id: string;
  name: string;
  paymentMethod: 'credit_card' | 'bank_transfer';
  totalSpent: number;
  transactionCount: number;
}

export interface AnalysisData {
  monthlyTotals: AnalysisMonthlyTotal[];
  groups: AnalysisGroupData[];
  tags: AnalysisTagData[];
  institutions: AnalysisInstitutionData[];
}

// Query keys
export const budgetKeys = {
  all: ['budget'] as const,
  monthSummary: (month: string) => [...budgetKeys.all, 'month', month] as const,
  allTransactions: () => [...budgetKeys.all, 'transactions'] as const,
  transactions: (filters?: TransactionFilters) =>
    [...budgetKeys.all, 'transactions', filters] as const,
  categories: () => [...budgetKeys.all, 'categories'] as const,
  categoryGroups: () => [...budgetKeys.all, 'categoryGroups'] as const,
  payees: () => [...budgetKeys.all, 'payees'] as const,
  blacklistedPayees: () => [...budgetKeys.all, 'payees', 'blacklisted'] as const,
  tags: () => [...budgetKeys.all, 'tags'] as const,
  analysis: () => [...budgetKeys.all, 'analysis'] as const,
  analysisRange: (startDate: string, endDate: string) =>
    [...budgetKeys.all, 'analysis', startDate, endDate] as const,
  allUncategorizedCounts: () => [...budgetKeys.all, 'uncategorizedCount'] as const,
  uncategorizedCount: (month: string) => [...budgetKeys.all, 'uncategorizedCount', month] as const,
  savings: () => [...budgetKeys.all, 'savings'] as const,
  payeeCategoryRules: () => [...budgetKeys.all, 'payeeCategoryRules'] as const,
  accountNames: () => [...budgetKeys.all, 'accountNames'] as const,
  accountNameIdentifiers: () => [...budgetKeys.all, 'accountNameIdentifiers'] as const,
  allMonthSummaries: () => [...budgetKeys.all, 'month'] as const,
  categorizationLogs: () => [...budgetKeys.all, 'categorizationLogs'] as const,
  aiUsage: () => [...budgetKeys.all, 'aiUsage'] as const,
};

// Account name mapping types
export interface BudgetAccountName {
  id: string;
  accountNumber: string;
  name: string;
}

export interface AccountNameIdentifier {
  accountNumber: string;
  count: number;
  samplePayee: string | null;
}

// Filter types
export interface TransactionFilters {
  month?: string;
  categoryId?: string;
  payeeId?: string;
  tagId?: string;
  type?: 'income' | 'expense';
  searchQuery?: string;
  uncategorized?: boolean;
  accountNumber?: string;
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
 * Fetches the household's billing-cycle start day (1, 2, or 10). Defaults
 * to 1 while the query is loading so callers get a sane synchronous value
 * for their first render. The query itself is cached for the session, so
 * the value stabilizes quickly and stays fresh across navigations.
 */
export function useBillingCycleStartDay(): number {
  const query = useQuery({
    queryKey: ['settings', 'billing-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/settings/billing-cycle');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { startDay: number };
    },
    staleTime: 5 * 60 * 1000,
  });
  return query.data?.startDay ?? 1;
}

/**
 * Hook to manage the currently-selected budget month. The displayed
 * value is derived from `Household.billingCycleStartDay` — so on July 4
 * with a start day of 10, the default is "2026-06" (the cycle that
 * started June 10). Once the user picks a month via the MonthSelector
 * the override state wins and the derived default is ignored.
 */
export function useSelectedMonth() {
  const startDay = useBillingCycleStartDay();
  const [override, setOverride] = useState<string | null>(null);
  const selectedMonth = override ?? getCurrentCycleMonth(new Date(), startDay);
  const setSelectedMonth = useCallback((next: string) => setOverride(next), []);
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
    staleTime: 30_000, // 30s
  });
}

/**
 * Hook to fetch all transactions with optional filters
 */
export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: budgetKeys.transactions(filters),
    enabled: filters !== undefined,
    staleTime: 30_000, // 30s
    queryFn: async (): Promise<BudgetTransaction[]> => {
      const params = new URLSearchParams();

      params.set('limit', '1000');
      if (filters?.month) params.set('month', filters.month);
      if (filters?.categoryId) params.set('categoryId', filters.categoryId);
      if (filters?.payeeId) params.set('payeeId', filters.payeeId);
      if (filters?.tagId) params.set('tagIds', filters.tagId);
      if (filters?.type) params.set('type', filters.type);
      if (filters?.uncategorized) params.set('uncategorized', 'true');
      if (filters?.accountNumber) params.set('accountNumber', filters.accountNumber);

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
 * Hook to fetch category groups with categories
 */
export function useCategoryGroups() {
  return useQuery({
    queryKey: budgetKeys.categoryGroups(),
    queryFn: async (): Promise<BudgetCategoryGroup[]> => {
      return fetchApi<BudgetCategoryGroup[]>('/api/budget/category-groups');
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch payees (excludes blacklisted by default — the API filters them
 * out so they never leak into transaction-edit dropdowns, summary aggregations,
 * or anywhere else outside the Blacklist tab).
 */
export function usePayees() {
  return useQuery({
    queryKey: budgetKeys.payees(),
    queryFn: async (): Promise<BudgetPayee[]> => {
      return fetchApi<BudgetPayee[]>('/api/budget/payees');
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch ONLY blacklisted payees, for the Blacklist tab on /budget/payees.
 */
export function useBlacklistedPayees(enabled = true) {
  return useQuery({
    queryKey: budgetKeys.blacklistedPayees(),
    queryFn: async (): Promise<BudgetPayee[]> => {
      return fetchApi<BudgetPayee[]>('/api/budget/payees?include=blacklisted');
    },
    staleTime: 5 * 60 * 1000,
    enabled,
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
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch budget analysis data for a date range
 */
export function useBudgetAnalysis(startDate: string, endDate: string) {
  return useQuery({
    queryKey: budgetKeys.analysisRange(startDate, endDate),
    queryFn: async (): Promise<AnalysisData> => {
      return fetchApi<AnalysisData>(
        `/api/budget/analysis?startDate=${startDate}&endDate=${endDate}`
      );
    },
    staleTime: 5 * 60 * 1000, // 5 min - analysis data is expensive to compute
  });
}

/**
 * Hook to fetch count of uncategorized transactions.
 * Pass a month (YYYY-MM) to scope to that month, or omit for all-time.
 */
export function useUncategorizedCount(month?: string) {
  const url = month
    ? `/api/budget/transactions/counts?month=${month}`
    : '/api/budget/transactions/counts';
  return useQuery({
    queryKey: month ? budgetKeys.uncategorizedCount(month) : budgetKeys.allUncategorizedCounts(),
    queryFn: async (): Promise<{ uncategorized: number }> => {
      return fetchApi<{ uncategorized: number }>(url);
    },
    staleTime: 5 * 60 * 1000,
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
  neverDefault?: boolean;
  isBlacklisted?: boolean;
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
    },
  });
}

export interface MoneytorSyncResult {
  fetched: number;
  upserted: number;
  budgetCreated: number;
  budgetSkipped: number;
  latestDate: string | null;
}

interface MoneytorSyncErrorBody {
  error?: string;
  code?: string;
  renewUrl?: string;
}

/**
 * Triggers a manual Moneytor sync for the active household and refreshes the
 * transaction-related queries on success. The endpoint returns an `{ ok }`
 * envelope (not the `{ success, data }` shape `fetchApi` expects), so it's
 * fetched directly here.
 */
export function useSyncMoneytor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<MoneytorSyncResult> => {
      const response = await fetch('/api/moneytor/sync', { method: 'POST' });
      const data: { ok: boolean } & MoneytorSyncResult & MoneytorSyncErrorBody =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Moneytor sync failed');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
    },
  });
}

// ─── AI auto-categorization ───────────────────────────────────────────────

export interface SuggestCategoriesResult {
  processed: number;
  suggested: number;
  lowConfidence: number;
  noMatch: number;
  errors: number;
}

export interface CategorizationLog {
  id: string;
  transactionName: string;
  status: 'suggested' | 'low_confidence' | 'no_match' | 'error';
  resultCategoryName: string | null;
  confidence: number | null;
  reasoning: string | null;
  createdAt: string;
}

/** Kick off an AI pass over uncategorized transactions. */
export function useSuggestCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { limit?: number; transactionIds?: string[] }) =>
      fetchApi<SuggestCategoriesResult>('/api/budget/transactions/suggest', {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.categorizationLogs() });
    },
  });
}

/** Approve (apply) or dismiss an AI suggestion for one transaction. */
export function useSuggestionAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'dismiss' }) =>
      fetchApi<{ id: string; action: string }>(`/api/budget/transactions/${id}/suggestion`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
    },
  });
}

export function useCategorizationLogs() {
  return useQuery({
    queryKey: budgetKeys.categorizationLogs(),
    queryFn: () => fetchApi<CategorizationLog[]>('/api/budget/categorization-logs'),
  });
}

export interface AiUsageData {
  currency: string;
  currentMonth: {
    month: string;
    spendUsd: number;
    transactionCount: number;
    avgCostUsd: number;
    tokens: {
      input: number;
      output: number;
      cacheCreation: number;
      cacheRead: number;
      webSearches: number;
    };
    breakdown: {
      inputUsd: number;
      outputUsd: number;
      cacheWriteUsd: number;
      cacheReadUsd: number;
      searchUsd: number;
      totalUsd: number;
    };
  };
  months: { month: string; spendUsd: number; transactionCount: number }[];
  pricing: {
    perMTok: { input: number; output: number; cacheWrite5m: number; cacheRead: number };
    perWebSearch: number;
  };
}

/** AI auto-categorization spend for the active household (Labs → AI Spend). */
export function useAiUsage() {
  return useQuery({
    queryKey: budgetKeys.aiUsage(),
    queryFn: () => fetchApi<AiUsageData>('/api/labs/ai-usage'),
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
    },
  });
}

export function useMergeCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sourceCategoryId: string;
      targetCategoryId: string;
    }): Promise<{ targetCategoryId: string; transactionsMoved: number; payeesUpdated: number }> => {
      return fetchApi('/api/budget/categories/merge', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.payees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.payeeCategoryRules() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.analysis() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.categoryGroups() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.payees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
      // Refresh both the visible-payees list and the blacklist tab — toggling
      // isBlacklisted moves the row between them.
      queryClient.invalidateQueries({ queryKey: budgetKeys.payees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.blacklistedPayees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.payees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
    },
  });
}

// Payee Category Rule hooks
export function usePayeeCategoryRules(enabled = true) {
  return useQuery({
    queryKey: budgetKeys.payeeCategoryRules(),
    queryFn: async (): Promise<PayeeCategoryRule[]> => {
      return fetchApi<PayeeCategoryRule[]>('/api/budget/payee-rules');
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

interface CreatePayeeCategoryRuleInput {
  name: string;
  operator: string;
  value: string;
  categoryId?: string | null;
  markNeverDefault?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

interface UpdatePayeeCategoryRuleInput {
  id: string;
  name?: string;
  operator?: string;
  value?: string;
  categoryId?: string | null;
  markNeverDefault?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export function useCreatePayeeCategoryRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePayeeCategoryRuleInput): Promise<PayeeCategoryRule> => {
      return fetchApi<PayeeCategoryRule>('/api/budget/payee-rules', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.payeeCategoryRules() });
    },
  });
}

export function useUpdatePayeeCategoryRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePayeeCategoryRuleInput): Promise<PayeeCategoryRule> => {
      const { id, ...data } = input;
      return fetchApi<PayeeCategoryRule>(`/api/budget/payee-rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.payeeCategoryRules() });
    },
  });
}

export function useDeletePayeeCategoryRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/payee-rules/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.payeeCategoryRules() });
    },
  });
}

export function useApplyPayeeCategoryRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string): Promise<{ matched: number; total: number }> => {
      return fetchApi<{ matched: number; total: number }>(
        `/api/budget/payee-rules/${ruleId}/apply`,
        { method: 'POST' }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.payeeCategoryRules() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.payees() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allUncategorizedCounts() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allMonthSummaries() });
    },
  });
}

// Account name mapping hooks

/**
 * Fetch the household's account-number → name mappings.
 */
export function useAccountNames() {
  return useQuery({
    queryKey: budgetKeys.accountNames(),
    queryFn: async (): Promise<BudgetAccountName[]> => {
      return fetchApi<BudgetAccountName[]>('/api/budget/account-names');
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch the distinct payment identifiers found on the household's transactions, for the
 * settings pick-list. Only fetched when enabled (e.g. when the settings section is shown).
 */
export function useAccountNameIdentifiers(enabled = true) {
  return useQuery({
    queryKey: budgetKeys.accountNameIdentifiers(),
    queryFn: async (): Promise<AccountNameIdentifier[]> => {
      return fetchApi<AccountNameIdentifier[]>('/api/budget/account-names/identifiers');
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useCreateAccountName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      accountNumber: string;
      name: string;
    }): Promise<BudgetAccountName> => {
      return fetchApi<BudgetAccountName>('/api/budget/account-names', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.accountNames() });
    },
  });
}

export function useUpdateAccountName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name: string }): Promise<BudgetAccountName> => {
      const { id, ...data } = input;
      return fetchApi<BudgetAccountName>(`/api/budget/account-names/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.accountNames() });
    },
  });
}

export function useDeleteAccountName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/budget/account-names/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.accountNames() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.tags() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.tags() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.tags() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
      queryClient.invalidateQueries({ queryKey: budgetKeys.tags() });
      queryClient.invalidateQueries({ queryKey: budgetKeys.allTransactions() });
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
    staleTime: 5 * 60 * 1000, // 5 min - rarely changes
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

export function useApplyRiseupMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ updated: number }> => {
      return fetchApi<{ updated: number }>('/api/budget/riseup-categories/apply', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all });
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

// Savings types and hooks
export interface SavingsMonth {
  month: string;
  amount: number;
  hasEntries: boolean;
}

export interface SavingsYear {
  year: number;
  total: number;
  months: SavingsMonth[];
}

export interface SavingsData {
  categoryId: string;
  years: SavingsYear[];
}

export function useSavings() {
  return useQuery({
    queryKey: budgetKeys.savings(),
    queryFn: async (): Promise<SavingsData> => {
      return fetchApi<SavingsData>('/api/budget/savings');
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useAddSavingsEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { month: string; amount: number }) => {
      return fetchApi<{ id: string; month: string; amount: number }>('/api/budget/savings', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
    },
  });
}

export function useUpdateSavingsEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { month: string; amount: number }) => {
      return fetchApi<{ id: string; month: string; amount: number }>('/api/budget/savings', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
    },
  });
}

export function useDeleteSavingsEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (month: string) => {
      return fetchApi<{ success: boolean }>('/api/budget/savings', {
        method: 'DELETE',
        body: JSON.stringify({ month }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.savings() });
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
