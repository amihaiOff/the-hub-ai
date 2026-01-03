/**
 * Unit tests for currency-context.tsx
 * Tests CurrencyProvider and useCurrency hook
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { CurrencyProvider, useCurrency } from '../currency-context';

// Mock the useExchangeRates hook
jest.mock('@/lib/hooks/use-exchange-rates', () => ({
  useExchangeRates: jest.fn(),
  ExchangeRates: {},
}));

import { useExchangeRates } from '@/lib/hooks/use-exchange-rates';

const mockUseExchangeRates = useExchangeRates as jest.MockedFunction<typeof useExchangeRates>;

// Create QueryClient for tests
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

// Wrapper with both QueryClient and CurrencyProvider
function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>{children}</CurrencyProvider>
      </QueryClientProvider>
    );
  };
}

describe('CurrencyContext', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseExchangeRates.mockReturnValue({
      data: { USD: 3.65, EUR: 3.95, GBP: 4.55, ILS: 1 },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      refetch: jest.fn(),
      // Add other required properties from UseQueryResult
    } as unknown as ReturnType<typeof useExchangeRates>);
  });

  describe('useCurrency hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useCurrency());
      }).toThrow('useCurrency must be used within a CurrencyProvider');

      consoleSpy.mockRestore();
    });

    it('should return default display currency as original', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      expect(result.current.displayCurrency).toBe('original');
    });

    it('should provide exchange rates from useExchangeRates', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      expect(result.current.rates).toEqual({
        USD: 3.65,
        EUR: 3.95,
        GBP: 4.55,
        ILS: 1,
      });
    });

    it('should provide loading state', () => {
      mockUseExchangeRates.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        isSuccess: false,
        refetch: jest.fn(),
      } as unknown as ReturnType<typeof useExchangeRates>);

      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoadingRates).toBe(true);
      expect(result.current.rates).toBeUndefined();
    });

    it('should provide error state', () => {
      const testError = new Error('Failed to fetch rates');
      mockUseExchangeRates.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: testError,
        isError: true,
        isSuccess: false,
        refetch: jest.fn(),
      } as unknown as ReturnType<typeof useExchangeRates>);

      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      expect(result.current.ratesError).toEqual(testError);
    });
  });

  describe('setDisplayCurrency', () => {
    it('should change display currency to ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      expect(result.current.displayCurrency).toBe('ILS');
    });

    it('should change display currency back to original', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      act(() => {
        result.current.setDisplayCurrency('original');
      });

      expect(result.current.displayCurrency).toBe('original');
    });
  });

  describe('convertToDisplay', () => {
    it('should return original value when displayCurrency is original', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const converted = result.current.convertToDisplay(100, 'USD');
      expect(converted).toBe(100);
    });

    it('should convert USD to ILS when displayCurrency is ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'USD');
      expect(converted).toBe(365); // 100 * 3.65
    });

    it('should convert EUR to ILS when displayCurrency is ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'EUR');
      expect(converted).toBe(395); // 100 * 3.95
    });

    it('should convert GBP to ILS when displayCurrency is ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'GBP');
      expect(converted).toBe(455); // 100 * 4.55
    });

    it('should return ILS as-is when converting ILS to ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'ILS');
      expect(converted).toBe(100); // ILS rate is 1
    });

    it('should return original value when rates not available', () => {
      mockUseExchangeRates.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isError: false,
        isSuccess: false,
        refetch: jest.fn(),
      } as unknown as ReturnType<typeof useExchangeRates>);

      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'USD');
      expect(converted).toBe(100);
    });

    it('should handle lowercase currency codes', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'usd');
      expect(converted).toBe(365);
    });

    it('should fall back to USD rate for unknown currency', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const converted = result.current.convertToDisplay(100, 'JPY');
      expect(converted).toBe(365); // Falls back to USD rate
    });
  });

  describe('formatValue', () => {
    it('should format in original currency when displayCurrency is original', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const formatted = result.current.formatValue(1234.56, 'USD');
      expect(formatted).toContain('1,234.56');
      expect(formatted).toMatch(/\$/); // USD symbol
    });

    it('should format in ILS when displayCurrency is ILS', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const formatted = result.current.formatValue(100, 'USD');
      // 100 USD * 3.65 = 365 ILS
      expect(formatted).toContain('365.00');
    });

    it('should use en-US locale for non-ILS currencies', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const formatted = result.current.formatValue(1000000, 'USD');
      expect(formatted).toContain('1,000,000'); // US number formatting
    });

    it('should use he-IL locale for ILS currency', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      const formatted = result.current.formatValue(1000, 'USD');
      // Should be formatted as ILS
      expect(formatted).toContain('3,650'); // 1000 * 3.65
    });

    it('should format zero value', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const formatted = result.current.formatValue(0, 'USD');
      expect(formatted).toContain('0.00');
    });

    it('should format negative value', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const formatted = result.current.formatValue(-1234.56, 'USD');
      expect(formatted).toMatch(/1,234\.56/);
    });

    it('should round to 2 decimal places', () => {
      const { result } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      const formatted = result.current.formatValue(1234.567, 'USD');
      expect(formatted).toContain('1,234.57');
    });
  });

  describe('Provider state persistence', () => {
    it('should maintain state across re-renders', () => {
      const { result, rerender } = renderHook(() => useCurrency(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setDisplayCurrency('ILS');
      });

      expect(result.current.displayCurrency).toBe('ILS');

      rerender();

      expect(result.current.displayCurrency).toBe('ILS');
    });
  });
});
