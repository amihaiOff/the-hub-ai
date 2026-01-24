'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrencyILS } from '@/lib/utils/budget';

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
  const isOverBudget = remaining < 0;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {/* Total Income */}
      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Income</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Income</p>
              <div className="text-sm font-bold text-green-500 tabular-nums sm:text-2xl">
                {formatCurrencyILS(totalIncome)}
              </div>
              <p className="text-muted-foreground hidden text-[10px] sm:block sm:text-xs">
                Total received
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Total Budgeted */}
      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Budgeted</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Budgeted</p>
              <div className="text-sm font-bold tabular-nums sm:text-2xl">
                {formatCurrencyILS(totalBudgeted)}
              </div>
              <p className="text-muted-foreground hidden text-[10px] sm:block sm:text-xs">
                Planned spending
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Total Spent / Remaining */}
      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Spent</CardTitle>
          <TrendingDown
            className={isOverBudget ? 'h-4 w-4 text-red-500' : 'text-muted-foreground h-4 w-4'}
          />
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Spent</p>
              <div
                className={`text-sm font-bold tabular-nums sm:text-2xl ${
                  isOverBudget ? 'text-red-500' : ''
                }`}
              >
                {formatCurrencyILS(totalSpent)}
              </div>
              <p
                className={`text-[10px] sm:text-xs ${
                  isOverBudget ? 'text-red-500' : 'text-muted-foreground'
                }`}
              >
                {isOverBudget
                  ? `Over by ${formatCurrencyILS(Math.abs(remaining))}`
                  : `${formatCurrencyILS(remaining)} remaining (${remainingPercent.toFixed(0)}%)`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
