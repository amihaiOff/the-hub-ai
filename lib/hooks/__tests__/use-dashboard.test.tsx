/**
 * Unit tests for use-dashboard.ts
 * Tests dashboard data fetching hook with React Query
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useDashboard, DashboardData } from '../use-dashboard';

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

describe('useDashboard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch dashboard data successfully', async () => {
    const mockData: DashboardData = {
      netWorth: 150000,
      portfolio: {
        totalValue: 50000,
        totalGain: 5000,
        totalGainPercent: 10,
        holdingsCount: 5,
      },
      pension: {
        totalValue: 75000,
        accountsCount: 2,
      },
      assets: {
        totalAssets: 30000,
        totalLiabilities: 5000,
        netValue: 25000,
        itemsCount: 3,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith('/api/dashboard');
  });

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'Unauthorized',
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Unauthorized'));
  });

  it('should handle missing data in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        // data is missing
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Failed to fetch dashboard data'));
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Network error');
  });

  it('should handle empty dashboard data (zero values)', async () => {
    const mockData: DashboardData = {
      netWorth: 0,
      portfolio: {
        totalValue: 0,
        totalGain: 0,
        totalGainPercent: 0,
        holdingsCount: 0,
      },
      pension: {
        totalValue: 0,
        accountsCount: 0,
      },
      assets: {
        totalAssets: 0,
        totalLiabilities: 0,
        netValue: 0,
        itemsCount: 0,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.netWorth).toBe(0);
    expect(result.current.data?.portfolio.holdingsCount).toBe(0);
    expect(result.current.data?.pension.accountsCount).toBe(0);
    expect(result.current.data?.assets.itemsCount).toBe(0);
  });

  it('should handle negative net worth', async () => {
    const mockData: DashboardData = {
      netWorth: -50000,
      portfolio: {
        totalValue: 10000,
        totalGain: -2000,
        totalGainPercent: -16.67,
        holdingsCount: 2,
      },
      pension: {
        totalValue: 0,
        accountsCount: 0,
      },
      assets: {
        totalAssets: 5000,
        totalLiabilities: 65000,
        netValue: -60000,
        itemsCount: 2,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.netWorth).toBe(-50000);
    expect(result.current.data?.portfolio.totalGain).toBe(-2000);
    expect(result.current.data?.assets.netValue).toBe(-60000);
  });

  it('should handle large portfolio values', async () => {
    const mockData: DashboardData = {
      netWorth: 10000000,
      portfolio: {
        totalValue: 5000000,
        totalGain: 1000000,
        totalGainPercent: 25,
        holdingsCount: 50,
      },
      pension: {
        totalValue: 3000000,
        accountsCount: 3,
      },
      assets: {
        totalAssets: 2500000,
        totalLiabilities: 500000,
        netValue: 2000000,
        itemsCount: 10,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.netWorth).toBe(10000000);
    expect(result.current.data?.portfolio.totalValue).toBe(5000000);
  });

  it('should use correct query key', async () => {
    const mockData: DashboardData = {
      netWorth: 100000,
      portfolio: {
        totalValue: 50000,
        totalGain: 5000,
        totalGainPercent: 10,
        holdingsCount: 5,
      },
      pension: {
        totalValue: 30000,
        accountsCount: 1,
      },
      assets: {
        totalAssets: 25000,
        totalLiabilities: 5000,
        netValue: 20000,
        itemsCount: 2,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDashboard(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify the query key is 'dashboard'
    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.findAll({ queryKey: ['dashboard'] });
    expect(queries.length).toBe(1);
  });

  it('should handle HTTP error status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'Internal server error',
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // The hook throws based on success field, not HTTP status
    expect(result.current.error).toEqual(new Error('Internal server error'));
  });

  it('should return loading state initially', () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  success: true,
                  data: { netWorth: 0 },
                }),
              }),
            1000
          )
        )
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it('should refetch on query invalidation', async () => {
    const mockData1: DashboardData = {
      netWorth: 100000,
      portfolio: {
        totalValue: 50000,
        totalGain: 5000,
        totalGainPercent: 10,
        holdingsCount: 5,
      },
      pension: { totalValue: 30000, accountsCount: 1 },
      assets: { totalAssets: 25000, totalLiabilities: 5000, netValue: 20000, itemsCount: 2 },
    };

    const mockData2: DashboardData = {
      netWorth: 120000,
      portfolio: {
        totalValue: 60000,
        totalGain: 8000,
        totalGainPercent: 15,
        holdingsCount: 6,
      },
      pension: { totalValue: 35000, accountsCount: 1 },
      assets: { totalAssets: 30000, totalLiabilities: 5000, netValue: 25000, itemsCount: 2 },
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockData2 }),
      });

    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDashboard(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.netWorth).toBe(100000);

    // Invalidate and refetch
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    await waitFor(() => expect(result.current.data?.netWorth).toBe(120000));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should verify net worth equals sum of components', async () => {
    const portfolioValue = 50000;
    const pensionValue = 30000;
    const assetsNetValue = 20000;
    const expectedNetWorth = portfolioValue + pensionValue + assetsNetValue;

    const mockData: DashboardData = {
      netWorth: expectedNetWorth,
      portfolio: {
        totalValue: portfolioValue,
        totalGain: 5000,
        totalGainPercent: 10,
        holdingsCount: 5,
      },
      pension: {
        totalValue: pensionValue,
        accountsCount: 1,
      },
      assets: {
        totalAssets: 25000,
        totalLiabilities: 5000,
        netValue: assetsNetValue,
        itemsCount: 2,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify net worth = portfolio + pension + assets net value
    const calculatedNetWorth =
      result.current.data!.portfolio.totalValue +
      result.current.data!.pension.totalValue +
      result.current.data!.assets.netValue;

    expect(result.current.data?.netWorth).toBe(calculatedNetWorth);
    expect(result.current.data?.netWorth).toBe(100000);
  });
});
