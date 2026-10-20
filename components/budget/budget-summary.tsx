'use client';

import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SpendOverDaysChart } from './spend-over-days-chart';

interface BudgetSummaryProps {
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  dailySpent?: { date: string; amount: number }[];
  isLoading?: boolean;
}

export function BudgetSummary({
  totalSpent,
  totalIncome,
  dailySpent = [],
  isLoading,
}: BudgetSummaryProps) {
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

      {/* Spent — opens the spend-over-days chart */}
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="hover:bg-secondary/50 focus-visible:ring-ring flex-1 cursor-pointer rounded-md text-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase sm:text-xs">
              Spent
            </span>
            {isLoading ? (
              <span className="bg-muted mx-auto mt-1 block h-5 w-14 animate-pulse rounded sm:h-7 sm:w-20" />
            ) : (
              <span className="mt-0.5 block text-base font-bold text-[#f5a5a5] tabular-nums sm:text-xl">
                {formatCurrencyILS(totalSpent)}
              </span>
            )}
            <span className="sr-only">, show daily spending chart</span>
          </button>
        </DialogTrigger>
        <DialogContent className="rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Spending over days</DialogTitle>
            <DialogDescription>
              Daily spend (bars) and running total (line) — {formatCurrencyILS(totalSpent)} total
            </DialogDescription>
          </DialogHeader>
          <SpendOverDaysChart dailySpent={dailySpent} />
        </DialogContent>
      </Dialog>

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
