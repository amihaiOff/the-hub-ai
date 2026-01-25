'use client';

import { Card } from '@/components/ui/card';
import { Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

interface BudgetSummaryProps {
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  isLoading?: boolean;
}

export function BudgetSummary({
  totalBudgeted,
  totalSpent,
  totalIncome,
  isLoading,
}: BudgetSummaryProps) {
  const remaining = totalBudgeted - totalSpent;
  const remainingPercent = totalBudgeted > 0 ? (remaining / totalBudgeted) * 100 : 0;
  const budgetedPercent = totalIncome > 0 ? (totalBudgeted / totalIncome) * 100 : 0;
  const isOverBudget = remaining < 0;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {/* Total Income */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase sm:text-xs">
            Income
          </p>
          <TrendingUp className="hidden h-4 w-4 text-green-500 sm:block" />
        </div>
        {isLoading ? (
          <div className="bg-muted mt-1 h-6 w-16 animate-pulse rounded sm:mt-2 sm:h-8 sm:w-28" />
        ) : (
          <>
            <div className="mt-1 text-base font-bold text-green-500 tabular-nums sm:mt-2 sm:text-2xl">
              {formatCurrencyILS(totalIncome)}
            </div>
            <p className="text-muted-foreground mt-0.5 hidden text-xs sm:block">Total received</p>
          </>
        )}
      </Card>

      {/* Total Budgeted */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase sm:text-xs">
            Budgeted
          </p>
          <Wallet className="text-muted-foreground hidden h-4 w-4 sm:block" />
        </div>
        {isLoading ? (
          <div className="bg-muted mt-1 h-6 w-16 animate-pulse rounded sm:mt-2 sm:h-8 sm:w-28" />
        ) : (
          <>
            <div className="mt-1 text-base font-bold tabular-nums sm:mt-2 sm:text-2xl">
              {formatCurrencyILS(totalBudgeted)}
            </div>
            <p className="text-muted-foreground mt-0.5 text-[10px] tabular-nums sm:text-xs">
              {budgetedPercent.toFixed(0)}% of income
            </p>
          </>
        )}
      </Card>

      {/* Total Spent / Remaining */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase sm:text-xs">
            Spent
          </p>
          <TrendingDown
            className={cn(
              'hidden h-4 w-4 sm:block',
              isOverBudget ? 'text-red-500' : 'text-muted-foreground'
            )}
          />
        </div>
        {isLoading ? (
          <div className="bg-muted mt-1 h-6 w-16 animate-pulse rounded sm:mt-2 sm:h-8 sm:w-28" />
        ) : (
          <>
            <div
              className={cn(
                'mt-1 text-base font-bold tabular-nums sm:mt-2 sm:text-2xl',
                isOverBudget && 'text-red-500'
              )}
            >
              {formatCurrencyILS(totalSpent)}
            </div>
            <p
              className={cn(
                'mt-0.5 text-[10px] tabular-nums sm:text-xs',
                isOverBudget ? 'text-red-500' : 'text-muted-foreground'
              )}
            >
              {isOverBudget
                ? `Over by ${formatCurrencyILS(Math.abs(remaining))}`
                : `${formatCurrencyILS(remaining)} left (${remainingPercent.toFixed(0)}%)`}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
