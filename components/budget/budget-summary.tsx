'use client';

import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

interface BudgetSummaryProps {
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  isLoading?: boolean;
}

export function BudgetSummary({ totalSpent, totalIncome, isLoading }: BudgetSummaryProps) {
  const net = totalIncome - totalSpent;
  const isNegative = net < 0;

  return (
    <div className="bg-card divide-border border-border flex items-center divide-x rounded-lg border px-1 py-3 sm:py-4">
      {/* Income */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Income
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
        ) : (
          <p className="mt-0.5 text-base font-bold text-[#a8caff] tabular-nums sm:text-xl">
            {formatCurrencyILS(totalIncome)}
          </p>
        )}
      </div>

      {/* Spent */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Spent
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
        ) : (
          <p className="mt-0.5 text-base font-bold text-[#f5a5a5] tabular-nums sm:text-xl">
            {formatCurrencyILS(totalSpent)}
          </p>
        )}
      </div>

      {/* Net */}
      <div className="flex-1 text-center">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
          Net
        </p>
        {isLoading ? (
          <div className="bg-muted mx-auto mt-1 h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
        ) : (
          <p
            className={cn(
              'mt-0.5 text-base font-bold tabular-nums sm:text-xl',
              isNegative ? 'text-[#f5a5a5]' : 'text-[#a8caff]'
            )}
          >
            {isNegative ? '-' : ''}
            {formatCurrencyILS(Math.abs(net))}
          </p>
        )}
      </div>
    </div>
  );
}
