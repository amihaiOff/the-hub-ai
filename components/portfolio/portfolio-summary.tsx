'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPercent } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import { convertToILS, formatCurrency } from '@/lib/hooks/use-exchange-rates';
import { cn } from '@/lib/utils';

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
  totalHoldings: _totalHoldings,
  isLoading,
  baseCurrency = 'ILS',
}: PortfolioSummaryProps) {
  const { formatValue, rates } = useCurrency();
  const isPositive = totalGainLoss >= 0;

  const ilsValue = rates ? convertToILS(totalValue, baseCurrency, rates) : null;

  return (
    <div className="bg-card/80 rounded-xl border px-5 py-5 shadow-sm sm:px-6 sm:py-6">
      {/* Label */}
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
        Total Portfolio Value
      </p>

      {/* Total Value */}
      {isLoading ? (
        <div className="bg-muted mt-2 h-10 w-48 animate-pulse rounded sm:h-12 sm:w-64" />
      ) : (
        <>
          <p className="mt-1 text-4xl font-bold tabular-nums sm:text-5xl">
            {formatValue(totalValue, baseCurrency)}
          </p>
          {ilsValue !== null && baseCurrency !== 'ILS' && (
            <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
              {formatCurrency(ilsValue, 'ILS')}
            </p>
          )}
        </>
      )}

      {/* Gain/Loss Badge */}
      {isLoading ? (
        <div className="bg-muted mt-3 h-6 w-40 animate-pulse rounded-full" />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums',
              isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            )}
            aria-label={`All-time gain/loss: ${formatPercent(totalGainLossPercent)}`}
          >
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {formatPercent(totalGainLossPercent)}
          </span>
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              isPositive ? 'text-emerald-400/80' : 'text-red-400/80'
            )}
          >
            {isPositive ? '+' : ''}
            {formatValue(totalGainLoss, baseCurrency)}
          </span>
          <span className="text-muted-foreground text-sm">all time</span>
        </div>
      )}
    </div>
  );
}
