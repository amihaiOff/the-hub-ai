'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface MoneytorTransactionRow {
  id: string;
  transactionDate: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  description: string;
  category: string;
  accountId: string;
  type: string;
  syncedAt: string;
}

export interface MoneytorTransactionsResponse {
  ok: true;
  transactions: MoneytorTransactionRow[];
  total: number;
  categories: string[];
  latestSyncedAt: string | null;
}

export interface MoneytorTransactionFilters {
  month?: string; // YYYY-MM
  category?: string;
  type?: string;
  search?: string;
}

export interface MoneytorSyncResult {
  ok: true;
  fetched: number;
  upserted: number;
  stockAccounts: number;
  stocksUpserted: number;
  latestDate: string | null;
  syncedAt: string;
}

export interface MoneytorStockHolding {
  id: string;
  stockName: string;
  amount: number;
  purchasePrice: number | null;
  purchaseDate: string | null;
  stockPrice: number;
  currency: string;
  totalWorthInBase: number;
}

export interface MoneytorStockAccount {
  productId: string;
  accountName: string;
  broker: string | null;
  cash: number | null;
  totalValue: number;
  holdings: MoneytorStockHolding[];
}

export interface MoneytorStocksResponse {
  ok: true;
  accounts: MoneytorStockAccount[];
}

export interface MoneytorErrorBody {
  ok: false;
  error: string;
  code?: string;
  renewUrl?: string;
}

export const moneytorKeys = {
  all: ['moneytor'] as const,
  transactions: (filters?: MoneytorTransactionFilters) =>
    [...moneytorKeys.all, 'transactions', filters ?? {}] as const,
  stocks: () => [...moneytorKeys.all, 'stocks'] as const,
  portfolio: () => [...moneytorKeys.all, 'portfolio'] as const,
  portfolioHistory: (range: string) =>
    [...moneytorKeys.all, 'portfolio', 'history', range] as const,
  accounts: () => [...moneytorKeys.all, 'accounts'] as const,
  accountsHistory: (range: string) => [...moneytorKeys.all, 'accounts', 'history', range] as const,
  pension: () => [...moneytorKeys.all, 'pension'] as const,
  pensionHistory: () => [...moneytorKeys.all, 'pension', 'history'] as const,
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T | MoneytorErrorBody;
  if (!response.ok || (data as MoneytorErrorBody).ok === false) {
    const err = data as MoneytorErrorBody;
    const error = new Error(err.error || `Request failed (${response.status})`) as Error & {
      code?: string;
      renewUrl?: string;
      status?: number;
    };
    error.code = err.code;
    error.renewUrl = err.renewUrl;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function useMoneytorTransactions(filters: MoneytorTransactionFilters) {
  return useQuery({
    queryKey: moneytorKeys.transactions(filters),
    staleTime: 30_000,
    queryFn: async (): Promise<MoneytorTransactionsResponse> => {
      const params = new URLSearchParams();
      if (filters.month) params.set('month', filters.month);
      if (filters.category) params.set('category', filters.category);
      if (filters.type) params.set('type', filters.type);
      if (filters.search) params.set('search', filters.search);
      return getJson<MoneytorTransactionsResponse>(
        `/api/moneytor/transactions?${params.toString()}`
      );
    },
  });
}

export interface MoneytorPortfolioHoldingValue {
  id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
}

export interface MoneytorPortfolioAccount {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  totalValue: number;
  totalHoldingsValue: number;
  totalCash: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: MoneytorPortfolioHoldingValue[];
  cashBalances: Array<{
    id: string;
    currency: string;
    amount: number;
    convertedAmount: number;
  }>;
  owners: [];
}

export interface MoneytorPortfolioResponse {
  ok: true;
  totalValue: number;
  totalHoldingsValue: number;
  totalCash: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  totalHoldings: number;
  accounts: MoneytorPortfolioAccount[];
}

export interface MoneytorPortfolioHistoryResponse {
  ok: true;
  range: string;
  points: { date: string; value: number }[];
  accounts: {
    productId: string;
    points: { date: string; value: number }[];
  }[];
}

export function useMoneytorPortfolio() {
  return useQuery({
    queryKey: moneytorKeys.portfolio(),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorPortfolioResponse> => {
      return getJson<MoneytorPortfolioResponse>('/api/moneytor/portfolio');
    },
  });
}

export function useMoneytorPortfolioHistory(range: string) {
  return useQuery({
    queryKey: moneytorKeys.portfolioHistory(range),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorPortfolioHistoryResponse> => {
      return getJson<MoneytorPortfolioHistoryResponse>(
        `/api/moneytor/portfolio/history?range=${encodeURIComponent(range)}`
      );
    },
  });
}

export interface MoneytorAccountRow {
  id: string;
  productId: string;
  form: 'bank' | 'debt' | string;
  name: string;
  institution: string | null;
  subtype: string | null;
  accountNumber: string | null;
  currency: string;
  balanceInBase: number;
  interestRate: number | null;
  maturityDate: string | null;
  monthlyPayment: number | null;
  customSubtitle: string | null;
  syncedAt: string;
}

export interface MoneytorAccountsResponse {
  ok: true;
  asOf: string | null;
  accounts: MoneytorAccountRow[];
  totals: { bank: number; debt: number; netInScope: number };
}

export function useMoneytorAccounts() {
  return useQuery({
    queryKey: moneytorKeys.accounts(),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorAccountsResponse> => {
      return getJson<MoneytorAccountsResponse>('/api/moneytor/accounts');
    },
  });
}

export interface UpdateMoneytorAccountInput {
  id: string;
  customSubtitle?: string | null;
}

export function useUpdateMoneytorAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateMoneytorAccountInput) => {
      return getJson<{ ok: true; account: { id: string; customSubtitle: string | null } }>(
        `/api/moneytor/accounts/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moneytorKeys.accounts() });
    },
  });
}

export interface MoneytorPensionFundRow {
  id: string;
  productId: string;
  routeName: string;
  routeCode: string | null;
  name: string;
  institution: string | null;
  productType: string;
  sugKupa: number | null;
  accountNumber: string | null;
  accountOwner: string | null;
  fundId: string | null;
  fundOpeningDate: string | null;
  amount: number;
  currency: string;
  balanceInBase: number;
  profitsFromLastYear: number | null;
  monthlyDepositEmployee: number | null;
  monthlyDepositEmployer: number | null;
  monthlyDepositSum: number | null;
  depositFrequency: string | null;
  employerProvisionPct: number | null;
  compensationProvisionPct: number | null;
  mgmtFeeFromSavings: number | null;
  mgmtFeeFromDeposit: number | null;
  projectedMonthlyPension: number | null;
  projectedSavingsWithPremiums: number | null;
  projectedSavingsWithoutPremiums: number | null;
  yearsToRetirement: number | null;
  gilPrisha: number | null;
  sumHafkadotPitsuyim: number | null;
  sumHafkadotLoPitsuyim: number | null;
  syncedAt: string;
}

export interface MoneytorPensionResponse {
  ok: true;
  asOf: string | null;
  funds: MoneytorPensionFundRow[];
  totals: { pension: number; hishtalmut: number; total: number };
}

export interface MoneytorPensionHistoryPoint {
  month: string; // YYYY-MM-01
  pension: number;
  hishtalmut: number;
  total: number;
}

export interface MoneytorPensionHistoryResponse {
  ok: true;
  history: MoneytorPensionHistoryPoint[];
}

export function useMoneytorPension() {
  return useQuery({
    queryKey: moneytorKeys.pension(),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorPensionResponse> => {
      return getJson<MoneytorPensionResponse>('/api/moneytor/pension');
    },
  });
}

export function useMoneytorPensionHistory() {
  return useQuery({
    queryKey: moneytorKeys.pensionHistory(),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorPensionHistoryResponse> => {
      return getJson<MoneytorPensionHistoryResponse>('/api/moneytor/pension/history');
    },
  });
}

export function useMoneytorStocks() {
  return useQuery({
    queryKey: moneytorKeys.stocks(),
    staleTime: 60_000,
    queryFn: async (): Promise<MoneytorStocksResponse> => {
      return getJson<MoneytorStocksResponse>('/api/moneytor/stocks');
    },
  });
}

export function useSyncMoneytor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<MoneytorSyncResult> => {
      return getJson<MoneytorSyncResult>('/api/moneytor/sync', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moneytorKeys.all });
    },
  });
}

export interface ForceResyncMoneytorInput {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface ForceResyncMoneytorResult {
  ok: true;
  householdId: string;
  from: string;
  to: string;
  deletedMoneytor: number;
  deletedBudget: number;
  fetched: number;
  upserted: number;
  budgetCreated: number;
  editsPreserved: number;
  syncedAt: string;
}

export function useForceResyncMoneytor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ForceResyncMoneytorInput): Promise<ForceResyncMoneytorResult> => {
      return getJson<ForceResyncMoneytorResult>('/api/moneytor/force-resync', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moneytorKeys.all });
    },
  });
}

export function useDeleteMoneytorAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string): Promise<void> => {
      await getJson(`/api/moneytor/stocks/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moneytorKeys.all });
    },
  });
}
