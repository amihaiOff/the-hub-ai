'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import type { StockSymbol } from '@/lib/data/stock-symbols';
import type { AutocompleteOption } from '@/components/ui/autocomplete';

interface StockSearchResponse {
  success: boolean;
  data?: StockSymbol[];
  error?: string;
}

async function searchStocks(query: string): Promise<StockSymbol[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
  const data: StockSearchResponse = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to search stocks');
  }

  return data.data;
}

export function useStockSearch(query: string, debounceMs: number = 300) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  const queryResult = useQuery({
    queryKey: ['stockSearch', debouncedQuery],
    queryFn: () => searchStocks(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
  });

  // Transform stock results to autocomplete options
  const options: AutocompleteOption[] = useMemo(() => {
    if (!queryResult.data) return [];

    return queryResult.data.map((stock) => ({
      value: stock.symbol,
      label: stock.name,
      badge: stock.exchange,
    }));
  }, [queryResult.data]);

  return {
    options,
    isLoading: queryResult.isLoading || (query !== debouncedQuery && query.length > 0),
    error: queryResult.error,
    data: queryResult.data,
  };
}
