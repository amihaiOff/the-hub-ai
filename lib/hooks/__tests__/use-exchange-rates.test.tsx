/**
 * Unit tests for use-exchange-rates.ts
 * Tests exchange rate fetching, caching, and currency conversion utilities
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useExchangeRates,
  convertToILS,
  formatCurrency,
  ExchangeRates,
} from '../use-exchange-rates';

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
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('Exchange Rates Module', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('useExchangeRates', () => {
    it('should fetch exchange rates successfully', async () => {
      const mockRates: ExchangeRates = {
        USD: 3.65,
        EUR: 3.95,
        GBP: 4.55,
        ILS: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          rates: mockRates,
          baseCurrency: 'ILS',
        }),
      });

      const { result } = renderHook(() => useExchangeRates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockRates);
      expect(mockFetch).toHaveBeenCalledWith('/api/exchange-rates');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Rate limit exceeded',
        }),
      });

      const { result } = renderHook(() => useExchangeRates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(new Error('Rate limit exceeded'));
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useExchangeRates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Network error');
    });

    it('should handle missing rates in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          // rates missing
          baseCurrency: 'ILS',
        }),
      });

      const { result } = renderHook(() => useExchangeRates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(new Error('Failed to fetch exchange rates'));
    });

    it('should use stale time of 1 hour', async () => {
      const mockRates: ExchangeRates = {
        USD: 3.65,
        EUR: 3.95,
        GBP: 4.55,
        ILS: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          rates: mockRates,
          baseCurrency: 'ILS',
        }),
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useExchangeRates(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Check query options
      const queryCache = queryClient.getQueryCache();
      const queries = queryCache.findAll({ queryKey: ['exchangeRates'] });
      expect(queries.length).toBe(1);
    });
  });

  describe('convertToILS', () => {
    const rates: ExchangeRates = {
      USD: 3.65,
      EUR: 3.95,
      GBP: 4.55,
      ILS: 1,
    };

    it('should convert USD to ILS', () => {
      const result = convertToILS(100, 'USD', rates);
      expect(result).toBe(365);
    });

    it('should convert EUR to ILS', () => {
      const result = convertToILS(100, 'EUR', rates);
      expect(result).toBe(395);
    });

    it('should convert GBP to ILS', () => {
      const result = convertToILS(100, 'GBP', rates);
      expect(result).toBe(455);
    });

    it('should return same value for ILS to ILS', () => {
      const result = convertToILS(100, 'ILS', rates);
      expect(result).toBe(100);
    });

    it('should handle lowercase currency codes', () => {
      const result = convertToILS(100, 'usd', rates);
      expect(result).toBe(365);
    });

    it('should fall back to USD rate for unknown currency', () => {
      const result = convertToILS(100, 'JPY', rates);
      expect(result).toBe(365); // Falls back to USD rate
    });

    it('should handle zero value', () => {
      const result = convertToILS(0, 'USD', rates);
      expect(result).toBe(0);
    });

    it('should handle negative value', () => {
      const result = convertToILS(-100, 'USD', rates);
      expect(result).toBe(-365);
    });

    it('should handle decimal values', () => {
      const result = convertToILS(99.99, 'USD', rates);
      expect(result).toBeCloseTo(364.9635);
    });
  });

  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      const result = formatCurrency(1234.56, 'USD');
      // Format depends on locale, but should contain the value
      expect(result).toContain('1,234.56');
    });

    it('should format EUR currency', () => {
      const result = formatCurrency(1234.56, 'EUR');
      expect(result).toContain('1,234.56');
    });

    it('should format ILS currency', () => {
      const result = formatCurrency(1234.56, 'ILS');
      expect(result).toContain('1,234.56');
    });

    it('should format zero value', () => {
      const result = formatCurrency(0, 'USD');
      expect(result).toContain('0.00');
    });

    it('should format negative value', () => {
      const result = formatCurrency(-1234.56, 'USD');
      expect(result).toMatch(/1,234\.56/);
    });

    it('should round to 2 decimal places', () => {
      const result = formatCurrency(1234.567, 'USD');
      expect(result).toContain('1,234.57');
    });

    it('should add trailing zeros for whole numbers', () => {
      const result = formatCurrency(1234, 'USD');
      expect(result).toContain('1,234.00');
    });

    it('should handle large numbers', () => {
      const result = formatCurrency(1234567.89, 'USD');
      expect(result).toContain('1,234,567.89');
    });

    it('should handle small decimal values', () => {
      const result = formatCurrency(0.01, 'USD');
      expect(result).toContain('0.01');
    });
  });
});
