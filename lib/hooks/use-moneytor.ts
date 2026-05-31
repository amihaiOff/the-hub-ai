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
