/**
 * Unit tests for use-stock-search.ts
 * Tests stock symbol search with debouncing
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useStockSearch } from '../use-stock-search';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock timers for debounce testing
jest.useFakeTimers();

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
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useStockSearch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  it('should return empty options for empty query', async () => {
    const { result } = renderHook(() => useStockSearch(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.options).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should debounce search requests after initial query', async () => {
    const mockStocks = [
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD' },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { result, rerender } = renderHook(
      ({ query }) => useStockSearch(query, 300),
      {
        wrapper: createWrapper(),
        initialProps: { query: 'A' },
      }
    );

    // Initial query triggers immediate fetch (debouncedQuery initialized to query)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/stocks/search?q=A');
    });

    mockFetch.mockClear();

    // Type more characters - these should be debounced
    rerender({ query: 'AA' });
    rerender({ query: 'AAP' });
    rerender({ query: 'AAPL' });

    // Should show loading during debounce
    expect(result.current.isLoading).toBe(true);

    // Fast forward past debounce
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    // Now fetch should be called with final query
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/stocks/search?q=AAPL');
  });

  it('should transform stock results to autocomplete options', async () => {
    const mockStocks = [
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', currency: 'USD' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { result } = renderHook(() => useStockSearch('tech', 0), {
      wrapper: createWrapper(),
    });

    // Skip debounce
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.options).toEqual([
      { value: 'AAPL', label: 'Apple Inc.', badge: 'NASDAQ', currency: 'USD' },
      { value: 'GOOGL', label: 'Alphabet Inc.', badge: 'NASDAQ', currency: 'USD' },
    ]);
  });

  it('should include exchange as badge', async () => {
    const mockStocks = [
      { symbol: 'TEVA.TA', name: 'Teva Pharmaceutical', exchange: 'TASE', currency: 'ILS' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { result } = renderHook(() => useStockSearch('TEVA', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.options.length).toBe(1));

    expect(result.current.options[0]).toEqual({
      value: 'TEVA.TA',
      label: 'Teva Pharmaceutical',
      badge: 'TASE',
      currency: 'ILS',
    });
  });

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'Search failed',
      }),
    });

    const { result } = renderHook(() => useStockSearch('error', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.error).toEqual(new Error('Search failed'));
    expect(result.current.options).toEqual([]);
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useStockSearch('network', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.error?.message).toBe('Network error');
  });

  it('should return loading state during debounce', () => {
    const { result } = renderHook(() => useStockSearch('loading', 300), {
      wrapper: createWrapper(),
    });

    // During debounce period, query !== debouncedQuery
    expect(result.current.isLoading).toBe(true);
  });

  it('should encode query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    renderHook(() => useStockSearch('test & query', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/stocks/search?q=test%20%26%20query');
  });

  it('should use custom debounce time for query changes', async () => {
    const mockStocks = [
      { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', currency: 'USD' },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { rerender } = renderHook(
      ({ query }) => useStockSearch(query, 500),
      {
        wrapper: createWrapper(),
        initialProps: { query: 'M' },
      }
    );

    // Initial query fetches immediately
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/stocks/search?q=M');
    });

    mockFetch.mockClear();

    // Change query - this should be debounced
    rerender({ query: 'MSFT' });

    // Not fetched after 300ms (custom debounce is 500ms)
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockFetch).not.toHaveBeenCalled();

    // Fetched after 500ms (custom debounce)
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/stocks/search?q=MSFT');
    });
  });

  it('should return raw data along with transformed options', async () => {
    const mockStocks = [
      { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { result } = renderHook(() => useStockSearch('NVDA', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual(mockStocks);
  });

  it('should not fetch when query becomes empty', async () => {
    const { result, rerender } = renderHook(
      ({ query }) => useStockSearch(query, 0),
      {
        wrapper: createWrapper(),
        initialProps: { query: '' },
      }
    );

    // Start with empty query
    expect(result.current.options).toEqual([]);

    // Change to non-empty then back to empty
    rerender({ query: 'A' });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    rerender({ query: '' });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    // Only one fetch for the 'A' query
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle missing currency in response', async () => {
    const mockStocks = [
      { symbol: 'UNKNOWN', name: 'Unknown Stock', exchange: 'OTC' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockStocks,
      }),
    });

    const { result } = renderHook(() => useStockSearch('UNKNOWN', 0), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    await waitFor(() => expect(result.current.options.length).toBe(1));

    expect(result.current.options[0]).toEqual({
      value: 'UNKNOWN',
      label: 'Unknown Stock',
      badge: 'OTC',
      currency: undefined,
    });
  });
});
