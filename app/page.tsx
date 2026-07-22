'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard } from '@/lib/hooks/use-dashboard';
import { formatCurrency, convertFromILS } from '@/lib/utils/portfolio';
import { useExchangeRates } from '@/lib/hooks/use-exchange-rates';
import { NetWorthChart } from '@/components/dashboard/net-worth-chart';
import { CurrencySelector, type DashboardCurrency } from '@/components/dashboard/currency-selector';
import { MoneytorBalancesCard } from '@/components/dashboard/moneytor-balances-card';
import { TotalWorthCard } from '@/components/dashboard/total-worth-card';
import { TasksSummaryCard } from '@/components/dashboard/tasks-summary-card';

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: rates, isLoading: ratesLoading } = useExchangeRates();
  const [displayCurrency, setDisplayCurrency] = useState<DashboardCurrency>('ILS');

  // Format a value from the API (which is in ILS) in the selected display currency
  const fmt = useCallback(
    (value: number) => {
      const converted = convertFromILS(value, displayCurrency, rates);
      return formatCurrency(converted, displayCurrency);
    },
    [displayCurrency, rates]
  );

  const hasData =
    data &&
    (data.portfolio.holdingsCount > 0 ||
      data.pension.accountsCount > 0 ||
      data.assets.itemsCount > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="page-title text-4xl font-bold tracking-tight">Dashboard</h1>
        <CurrencySelector
          currency={displayCurrency}
          onCurrencyChange={setDisplayCurrency}
          disabled={ratesLoading || !rates}
        />
      </div>

      {/* Total worth — headline net worth + itemized breakdown by category. */}
      <TotalWorthCard
        breakdown={data?.breakdown}
        netWorth={data?.netWorth}
        format={fmt}
        isLoading={isLoading}
        error={error}
      />

      {/* Tasks — what needs your attention right now. */}
      <TasksSummaryCard />

      {/* Moneytor balances — bank accounts, debts, credit cards. */}
      <MoneytorBalancesCard />

      {/* Net Worth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Net Worth Over Time</CardTitle>
          <CardDescription>Track your financial progress across all accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <NetWorthChart displayCurrency={displayCurrency} rates={rates} />
          ) : (
            <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">Chart will appear here once you add data</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
