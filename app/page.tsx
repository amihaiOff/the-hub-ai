'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Wallet } from 'lucide-react';
import { useDashboard } from '@/lib/hooks/use-dashboard';
import { formatCurrency, formatPercent } from '@/lib/utils/portfolio';
import Link from 'next/link';

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();

  const hasData =
    data &&
    (data.portfolio.holdingsCount > 0 ||
      data.pension.accountsCount > 0 ||
      data.assets.itemsCount > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">Your financial overview at a glance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Worth Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Net Worth</CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="bg-muted h-8 w-32 animate-pulse rounded" />
            ) : error ? (
              <div className="text-destructive text-sm">Failed to load</div>
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(data?.netWorth || 0)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {hasData ? 'Combined from all sources' : 'Add your accounts to get started'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Stock Portfolio Card */}
        <Link href="/portfolio">
          <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stock Portfolio</CardTitle>
              {data && data.portfolio.totalGain >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="bg-muted h-8 w-32 animate-pulse rounded" />
              ) : error ? (
                <div className="text-destructive text-sm">Failed to load</div>
              ) : (
                <>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCurrency(data?.portfolio.totalValue || 0)}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {data && data.portfolio.holdingsCount > 0 ? (
                      <span
                        className={
                          data.portfolio.totalGain >= 0 ? 'text-green-500' : 'text-red-500'
                        }
                      >
                        {data.portfolio.totalGain >= 0 ? '+' : ''}
                        {formatCurrency(data.portfolio.totalGain)} (
                        {formatPercent(data.portfolio.totalGainPercent)})
                      </span>
                    ) : (
                      `${data?.portfolio.holdingsCount || 0} holdings`
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Pension Card */}
        <Link href="/pension">
          <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pension</CardTitle>
              <PiggyBank className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="bg-muted h-8 w-32 animate-pulse rounded" />
              ) : error ? (
                <div className="text-destructive text-sm">Failed to load</div>
              ) : (
                <>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCurrency(data?.pension.totalValue || 0)}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {data?.pension.accountsCount || 0} accounts
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Other Assets Card */}
        <Link href="/assets">
          <Card className="hover:bg-accent/50 cursor-pointer transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Other Assets</CardTitle>
              <Wallet className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="bg-muted h-8 w-32 animate-pulse rounded" />
              ) : error ? (
                <div className="text-destructive text-sm">Failed to load</div>
              ) : (
                <>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCurrency(data?.assets.netValue || 0)}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {data?.assets.itemsCount || 0} assets/debts
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Net Worth Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Net Worth Over Time</CardTitle>
          <CardDescription>Track your financial progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              {hasData
                ? 'Net worth history chart coming soon'
                : 'Chart will appear here once you add data'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
