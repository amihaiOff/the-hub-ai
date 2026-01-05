'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/assets';

interface AssetsSummaryProps {
  totalAssets: number;
  totalLiabilities: number;
  netValue: number;
  isLoading?: boolean;
}

export function AssetsSummary({
  totalAssets,
  totalLiabilities,
  netValue,
  isLoading,
}: AssetsSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                {formatCurrency(totalAssets)}
              </div>
              <p className="text-muted-foreground text-xs">Deposits & Savings</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
          <TrendingDown className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold text-red-600 tabular-nums dark:text-red-400">
                {formatCurrency(totalLiabilities)}
              </div>
              <p className="text-muted-foreground text-xs">Loans & Mortgages</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Value</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          ) : (
            <>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  netValue >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {netValue >= 0 ? '+' : ''}
                {formatCurrency(netValue)}
              </div>
              <p className="text-muted-foreground text-xs">Assets minus liabilities</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
