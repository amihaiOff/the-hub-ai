'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { formatPercent } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';

interface PortfolioSummaryProps {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  totalHoldings: number;
  isLoading?: boolean;
  baseCurrency?: string;
}

export function PortfolioSummary({
  totalValue,
  totalGainLoss,
  totalGainLossPercent,
  totalHoldings,
  isLoading,
  baseCurrency = 'USD',
}: PortfolioSummaryProps) {
  const { formatValue } = useCurrency();
  const isPositive = totalGainLoss >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">
                {formatValue(totalValue, baseCurrency)}
              </div>
              <p className="text-xs text-muted-foreground">Across all accounts</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Gain/Loss</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  isPositive ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {isPositive ? '+' : ''}
                {formatValue(totalGainLoss, baseCurrency)}
              </div>
              <p
                className={`text-xs ${
                  isPositive ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {formatPercent(totalGainLossPercent)}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Holdings</CardTitle>
          <PieChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">{totalHoldings}</div>
              <p className="text-xs text-muted-foreground">Unique stocks</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
