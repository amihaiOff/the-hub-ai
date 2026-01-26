'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';
import { formatPercent } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import { convertToILS, formatCurrency } from '@/lib/hooks/use-exchange-rates';

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
  const { formatValue, rates } = useCurrency();
  const isPositive = totalGainLoss >= 0;

  // Get ILS values if rates are available (uses shared utility)
  const ilsValue = rates ? convertToILS(totalValue, baseCurrency, rates) : null;
  const ilsGainLoss = rates ? convertToILS(totalGainLoss, baseCurrency, rates) : null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Total Value</CardTitle>
          <DollarSign className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Total Value</p>
              <div className="text-sm font-bold tabular-nums sm:text-2xl">
                {formatValue(totalValue, baseCurrency)}
              </div>
              {ilsValue !== null && baseCurrency !== 'ILS' && (
                <p className="text-muted-foreground text-[10px] tabular-nums sm:text-xs">
                  {formatCurrency(ilsValue, 'ILS')}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Total Gain/Loss</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Gain/Loss</p>
              <div
                className={`text-sm font-bold tabular-nums sm:text-2xl ${
                  isPositive ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {isPositive ? '+' : ''}
                {formatValue(totalGainLoss, baseCurrency)}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                {ilsGainLoss !== null && baseCurrency !== 'ILS' && (
                  <span
                    className={`text-[10px] tabular-nums sm:text-xs ${isPositive ? 'text-green-500/70' : 'text-red-500/70'}`}
                  >
                    {isPositive ? '+' : ''}
                    {formatCurrency(ilsGainLoss, 'ILS')}
                  </span>
                )}
                <span
                  className={`text-[10px] sm:text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                >
                  {formatPercent(totalGainLossPercent)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Holdings</CardTitle>
          <PieChart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-10 animate-pulse rounded sm:h-8 sm:w-16" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Holdings</p>
              <div className="text-sm font-bold tabular-nums sm:text-2xl">{totalHoldings}</div>
              <p className="text-muted-foreground hidden text-[10px] sm:block sm:text-xs">
                Unique stocks
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
