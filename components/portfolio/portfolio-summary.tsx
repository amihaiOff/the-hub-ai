'use client';

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
  totalHoldings,
  isLoading,
  baseCurrency = 'ILS',
}: PortfolioSummaryProps) {
  const { formatValue, rates } = useCurrency();
  const isPositive = totalGainLoss >= 0;

  const ilsValue = rates ? convertToILS(totalValue, baseCurrency, rates) : null;
  const ilsGainLoss = rates ? convertToILS(totalGainLoss, baseCurrency, rates) : null;

  return (
    <div className="bg-card/80 flex items-center divide-x rounded-xl border px-1 py-3 sm:py-4">
      {/* Total Value */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Value
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
        ) : (
          <>
            <p className="mt-0.5 text-base font-bold tabular-nums sm:text-xl">
              {formatValue(totalValue, baseCurrency)}
            </p>
            {ilsValue !== null && baseCurrency !== 'ILS' && (
              <p className="text-muted-foreground text-[10px] tabular-nums sm:text-xs">
                {formatCurrency(ilsValue, 'ILS')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Gain/Loss */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Gain/Loss
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
        ) : (
          <>
            <p
              className={cn(
                'mt-0.5 text-base font-bold tabular-nums sm:text-xl',
                isPositive ? 'text-green-500' : 'text-red-500'
              )}
            >
              {isPositive ? '+' : ''}
              {formatValue(totalGainLoss, baseCurrency)}
            </p>
            <div className="flex items-center justify-center gap-1">
              {ilsGainLoss !== null && baseCurrency !== 'ILS' && (
                <span
                  className={cn(
                    'text-[10px] tabular-nums sm:text-xs',
                    isPositive ? 'text-green-500/70' : 'text-red-500/70'
                  )}
                >
                  {isPositive ? '+' : ''}
                  {formatCurrency(ilsGainLoss, 'ILS')}
                </span>
              )}
              <span
                className={cn(
                  'text-[10px] sm:text-xs',
                  isPositive ? 'text-green-500' : 'text-red-500'
                )}
              >
                {formatPercent(totalGainLossPercent)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Holdings */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Holdings
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-10 animate-pulse rounded sm:h-7 sm:w-14" />
        ) : (
          <p className="mt-0.5 text-base font-bold tabular-nums sm:text-xl">{totalHoldings}</p>
        )}
      </div>
    </div>
  );
}
