/**
 * Unit tests for use-moneytor.ts hooks
 * Tests React Query hooks for Moneytor data (transactions, portfolio, accounts, pension, stocks)
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useMoneytorTransactions,
  useMoneytorPortfolio,
  useMoneytorPortfolioHistory,
  useMoneytorAccounts,
  useMoneytorPension,
  useMoneytorPensionHistory,
  useMoneytorStocks,
  useSyncMoneytor,
  useUpdateMoneytorAccount,
  useForceResyncMoneytor,
  useDeleteMoneytorAccount,
  type MoneytorTransactionsResponse,
  type MoneytorPortfolioResponse,
  type MoneytorAccountsResponse,
  type MoneytorPensionResponse,
  type MoneytorStocksResponse,
} from '../use-moneytor';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
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
}

// Wrapper component for React Query hooks
function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const mockTransactionsResponse: MoneytorTransactionsResponse = {
  ok: true,
  transactions: [
    {
      id: 'tx-1',
      transactionDate: '2026-06-01',
      amount: 150.5,
      currency: 'ILS',
      description: 'Supermarket',
      category: 'Food',
      accountId: 'acc-1',
      type: 'expense',
      syncedAt: '2026-06-12T00:00:00.000Z',
    },
  ],
  total: 1,
  categories: ['Food', 'Transport'],
  latestSyncedAt: '2026-06-12T00:00:00.000Z',
};

const mockPortfolioResponse: MoneytorPortfolioResponse = {
  ok: true,
  totalValue: 50000,
  totalHoldingsValue: 48000,
  totalCash: 2000,
  totalCostBasis: 40000,
  totalGainLoss: 8000,
  totalGainLossPercent: 20,
  totalHoldings: 3,
  accounts: [
    {
      id: 'acc-1',
      name: 'Trading Account',
      broker: 'IBI',
      currency: 'ILS',
      totalValue: 50000,
      totalHoldingsValue: 48000,
      totalCash: 2000,
      totalCostBasis: 40000,
      totalGainLoss: 8000,
      totalGainLossPercent: 20,
      holdings: [],
      cashBalances: [],
      owners: [],
    },
  ],
};

const mockAccountsResponse: MoneytorAccountsResponse = {
  ok: true,
  asOf: '2026-06-12T00:00:00.000Z',
  accounts: [
    {
      id: 'acct-1',
      productId: 'prod-1',
      form: 'bank',
      name: 'Checking',
      institution: 'Leumi',
      subtype: 'current',
      accountNumber: '1234',
      currency: 'ILS',
      balanceInBase: 10000,
      interestRate: null,
      maturityDate: null,
      monthlyPayment: null,
      customSubtitle: null,
      syncedAt: '2026-06-12T00:00:00.000Z',
    },
  ],
  totals: { bank: 10000, debt: 0, netInScope: 10000 },
};

const mockPensionResponse: MoneytorPensionResponse = {
  ok: true,
  asOf: '2026-06-12T00:00:00.000Z',
  funds: [
    {
      id: 'fund-1',
      productId: 'prod-2',
      routeName: 'pension',
      routeCode: 'P1',
      name: 'My Pension',
      institution: 'Clal',
      productType: 'pension',
      sugKupa: null,
      accountNumber: '9999',
      accountOwner: 'Alice',
      fundId: 'F123',
      fundOpeningDate: '2010-01-01',
      amount: 300000,
      currency: 'ILS',
      balanceInBase: 300000,
      profitsFromLastYear: 15000,
      monthlyDepositEmployee: 1000,
      monthlyDepositEmployer: 1500,
      monthlyDepositSum: 2500,
      depositFrequency: 'monthly',
      employerProvisionPct: 8.33,
      compensationProvisionPct: 8.33,
      mgmtFeeFromSavings: 0.1,
      mgmtFeeFromDeposit: 0.5,
      projectedMonthlyPension: 5000,
      projectedSavingsWithPremiums: 800000,
      projectedSavingsWithoutPremiums: 600000,
      yearsToRetirement: 20,
      gilPrisha: null,
      sumHafkadotPitsuyim: null,
      sumHafkadotLoPitsuyim: null,
      syncedAt: '2026-06-12T00:00:00.000Z',
    },
  ],
  totals: { pension: 300000, hishtalmut: 0, total: 300000 },
};

const mockStocksResponse: MoneytorStocksResponse = {
  ok: true,
  accounts: [
    {
      productId: 'stock-prod-1',
      accountName: 'Stocks Account',
      broker: 'IBI',
      cash: 2000,
      totalValue: 52000,
      holdings: [
        {
          id: 'h-1',
          stockName: 'Apple Inc.',
          amount: 10,
          purchasePrice: 150,
          purchaseDate: '2025-01-01',
          stockPrice: 200,
          currency: 'USD',
          totalWorthInBase: 20000,
        },
      ],
    },
  ],
};

describe('Moneytor Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── Query hooks ──────────────────────────────────────────────────────────────

  describe('useMoneytorTransactions', () => {
    it('should fetch transactions with no filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactionsResponse,
      });

      const { result } = renderHook(() => useMoneytorTransactions({}), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockTransactionsResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/transactions?', expect.any(Object));
    });

    it('should fetch transactions with month filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactionsResponse,
      });

      const { result } = renderHook(() => useMoneytorTransactions({ month: '2026-06' }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/transactions?month=2026-06',
        expect.any(Object)
      );
    });

    it('should fetch transactions with multiple filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactionsResponse,
      });

      const { result } = renderHook(
        () =>
          useMoneytorTransactions({
            month: '2026-06',
            category: 'Food',
            type: 'expense',
            search: 'super',
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('month=2026-06');
      expect(calledUrl).toContain('category=Food');
      expect(calledUrl).toContain('type=expense');
      expect(calledUrl).toContain('search=super');
    });

    it('should handle API error (ok: false body)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          renewUrl: 'https://moneytor.io/renew',
        }),
        status: 401,
      });

      const { result } = renderHook(() => useMoneytorTransactions({}), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Token expired');
    });
  });

  describe('useMoneytorPortfolio', () => {
    it('should fetch portfolio successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPortfolioResponse,
      });

      const { result } = renderHook(() => useMoneytorPortfolio(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockPortfolioResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/portfolio', expect.any(Object));
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useMoneytorPortfolio(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useMoneytorPortfolioHistory', () => {
    it('should fetch portfolio history for a given range', async () => {
      const mockHistoryResponse = {
        ok: true,
        range: '1Y',
        points: [
          { date: '2025-06-12', value: 45000 },
          { date: '2026-06-12', value: 50000 },
        ],
        accounts: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistoryResponse,
      });

      const { result } = renderHook(() => useMoneytorPortfolioHistory('1Y'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockHistoryResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/portfolio/history?range=1Y',
        expect.any(Object)
      );
    });
  });

  describe('useMoneytorAccounts', () => {
    it('should fetch accounts successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccountsResponse,
      });

      const { result } = renderHook(() => useMoneytorAccounts(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockAccountsResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/accounts', expect.any(Object));
    });

    it('should handle error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'Unauthorized' }),
        status: 401,
      });

      const { result } = renderHook(() => useMoneytorAccounts(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useMoneytorPension', () => {
    it('should fetch pension data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPensionResponse,
      });

      const { result } = renderHook(() => useMoneytorPension(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockPensionResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/pension', expect.any(Object));
    });
  });

  describe('useMoneytorPensionHistory', () => {
    it('should fetch pension history successfully', async () => {
      const mockPensionHistory = {
        ok: true,
        history: [
          { month: '2026-01-01', pension: 290000, hishtalmut: 50000, total: 340000 },
          { month: '2026-06-01', pension: 300000, hishtalmut: 52000, total: 352000 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPensionHistory,
      });

      const { result } = renderHook(() => useMoneytorPensionHistory(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockPensionHistory);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/pension/history', expect.any(Object));
    });
  });

  describe('useMoneytorStocks', () => {
    it('should fetch stocks successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStocksResponse,
      });

      const { result } = renderHook(() => useMoneytorStocks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockStocksResponse);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/stocks', expect.any(Object));
    });
  });

  // ─── Mutation hooks ─────────────────────────────────────────────────────────

  describe('useSyncMoneytor', () => {
    it('should sync successfully', async () => {
      const syncResult = {
        ok: true,
        fetched: 120,
        upserted: 15,
        stockAccounts: 2,
        stocksUpserted: 30,
        latestDate: '2026-06-12',
        syncedAt: '2026-06-12T10:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => syncResult,
      });

      const { result } = renderHook(() => useSyncMoneytor(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const res = await result.current.mutateAsync();
        expect(res).toEqual(syncResult);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/sync',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle sync error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'Sync failed' }),
        status: 500,
      });

      const { result } = renderHook(() => useSyncMoneytor(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync();
        })
      ).rejects.toThrow('Sync failed');
    });
  });

  describe('useUpdateMoneytorAccount', () => {
    it('should update account custom subtitle', async () => {
      const updateResult = {
        ok: true,
        account: { id: 'acct-1', customSubtitle: 'My Main Account' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updateResult,
      });

      const { result } = renderHook(() => useUpdateMoneytorAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const res = await result.current.mutateAsync({
          id: 'acct-1',
          customSubtitle: 'My Main Account',
        });
        expect(res).toEqual(updateResult);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/accounts/acct-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ customSubtitle: 'My Main Account' }),
        })
      );
    });

    it('should clear custom subtitle (null)', async () => {
      const updateResult = {
        ok: true,
        account: { id: 'acct-1', customSubtitle: null },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updateResult,
      });

      const { result } = renderHook(() => useUpdateMoneytorAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'acct-1', customSubtitle: null });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/accounts/acct-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ customSubtitle: null }),
        })
      );
    });
  });

  describe('useForceResyncMoneytor', () => {
    it('should force resync with date range', async () => {
      const resyncResult = {
        ok: true,
        householdId: 'hh-1',
        from: '2026-01-01',
        to: '2026-06-12',
        deletedMoneytor: 50,
        deletedBudget: 50,
        fetched: 60,
        upserted: 60,
        budgetCreated: 60,
        editsPreserved: 5,
        syncedAt: '2026-06-12T10:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => resyncResult,
      });

      const { result } = renderHook(() => useForceResyncMoneytor(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const res = await result.current.mutateAsync({
          from: '2026-01-01',
          to: '2026-06-12',
        });
        expect(res).toEqual(resyncResult);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/force-resync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ from: '2026-01-01', to: '2026-06-12' }),
        })
      );
    });
  });

  describe('useDeleteMoneytorAccount', () => {
    it('should delete a Moneytor stock account by productId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const { result } = renderHook(() => useDeleteMoneytorAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('stock-prod-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/moneytor/stocks/stock-prod-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should handle delete error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'Account not found' }),
        status: 404,
      });

      const { result } = renderHook(() => useDeleteMoneytorAccount(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('nonexistent');
        })
      ).rejects.toThrow('Account not found');
    });
  });

  // ─── Cache invalidation ──────────────────────────────────────────────────────

  describe('Cache Invalidation', () => {
    it('should invalidate all moneytor queries after sync', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          fetched: 10,
          upserted: 5,
          stockAccounts: 1,
          stocksUpserted: 3,
          latestDate: null,
          syncedAt: '2026-06-12T00:00:00.000Z',
        }),
      });

      const { result } = renderHook(() => useSyncMoneytor(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['moneytor']) })
      );
    });

    it('should invalidate accounts query after updating account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, account: { id: 'acct-1', customSubtitle: 'Test' } }),
      });

      const { result } = renderHook(() => useUpdateMoneytorAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'acct-1', customSubtitle: 'Test' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['moneytor', 'accounts']) })
      );
    });
  });
});
