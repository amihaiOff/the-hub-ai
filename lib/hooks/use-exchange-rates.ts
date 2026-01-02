'use client';

import { useQuery } from '@tanstack/react-query';

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  ILS: number;
}

interface ExchangeRatesResponse {
  success: boolean;
  rates?: ExchangeRates;
  baseCurrency: string;
  error?: string;
}

async function fetchExchangeRates(): Promise<ExchangeRates> {
  const response = await fetch('/api/exchange-rates');
  const data: ExchangeRatesResponse = await response.json();

  if (!data.success || !data.rates) {
    throw new Error(data.error || 'Failed to fetch exchange rates');
  }

  return data.rates;
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ['exchangeRates'],
    queryFn: fetchExchangeRates,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
  });
}

// Convert a value from one currency to ILS
export function convertToILS(
  value: number,
  fromCurrency: string,
  rates: ExchangeRates
): number {
  const currency = fromCurrency.toUpperCase() as keyof ExchangeRates;
  const rate = rates[currency] || rates.USD;
  return value * rate;
}

// Format currency with proper symbol
export function formatCurrency(value: number, currency: string): string {
  const formatter = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(value);
}
