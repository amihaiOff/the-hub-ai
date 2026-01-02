'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useExchangeRates, ExchangeRates } from '@/lib/hooks/use-exchange-rates';

type DisplayCurrency = 'original' | 'ILS';

interface CurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  rates: ExchangeRates | undefined;
  isLoadingRates: boolean;
  ratesError: Error | null;
  convertToDisplay: (value: number, originalCurrency: string) => number;
  formatValue: (value: number, originalCurrency: string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('original');
  const { data: rates, isLoading: isLoadingRates, error: ratesError } = useExchangeRates();

  const convertToDisplay = useCallback(
    (value: number, originalCurrency: string): number => {
      if (displayCurrency === 'original' || !rates) {
        return value;
      }

      // Convert to ILS
      const currency = originalCurrency.toUpperCase() as keyof ExchangeRates;
      const rate = rates[currency] || rates.USD;
      return value * rate;
    },
    [displayCurrency, rates]
  );

  const formatValue = useCallback(
    (value: number, originalCurrency: string): string => {
      const convertedValue = convertToDisplay(value, originalCurrency);
      const currency = displayCurrency === 'ILS' ? 'ILS' : originalCurrency;

      return new Intl.NumberFormat(currency === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(convertedValue);
    },
    [displayCurrency, convertToDisplay]
  );

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        setDisplayCurrency,
        rates,
        isLoadingRates,
        ratesError: ratesError as Error | null,
        convertToDisplay,
        formatValue,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
