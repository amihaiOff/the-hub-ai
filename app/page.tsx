'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard } from '@/lib/hooks/use-dashboard';
import { formatCurrency, convertFromILS } from '@/lib/utils/portfolio';
import { useExchangeRates } from '@/lib/hooks/use-exchange-rates';
import { NetWorthChart } from '@/components/dashboard/net-worth-chart';
import { CurrencySelector, type DashboardCurrency } from '@/components/dashboard/currency-selector';
import { MoneytorBalancesCard } from '@/components/dashboard/moneytor-balances-card';
import { TotalWorthCard } from '@/components/dashboard/total-worth-card';
import { TasksSummaryCard } from '@/components/dashboard/tasks-summary-card';
import { DashboardNotesCard } from '@/components/dashboard/dashboard-notes-card';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: rates, isLoading: ratesLoading } = useExchangeRates();
  const [displayCurrency, setDisplayCurrency] = useState<DashboardCurrency>('ILS');
  // Net worth block is heavy visually — collapsed by default so the top of
  // the page is tasks + notes, per user preference. The choice sticks for
  // the session; not persisted (page-reload = closed, which is intentional).
  const [worthOpen, setWorthOpen] = useState(false);

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
      <div className="mb-10 flex items-center justify-between">
        <h1 className="page-title text-4xl font-bold tracking-tight">Dashboard</h1>
        <CurrencySelector
          currency={displayCurrency}
          onCurrencyChange={setDisplayCurrency}
          disabled={ratesLoading || !rates}
        />
      </div>

      {/* Tasks — what needs your attention right now, so it sits at the top. */}
      <TasksSummaryCard />

      {/* Notes — a lightweight scratchpad for later processing. Household-shared. */}
      <DashboardNotesCard />

      {/* Moneytor balances — bank accounts, debts, credit cards. Kept out of
          the collapsible below so day-to-day cash-flow numbers stay visible. */}
      <MoneytorBalancesCard />

      {/* Total worth — collapsible, at the bottom. Contains the breakdown
          card and the net-worth-over-time chart. Closed by default so the
          headline number isn't in-your-face on every visit. */}
      <Card>
        <button
          type="button"
          onClick={() => setWorthOpen((v) => !v)}
          aria-expanded={worthOpen}
          className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-t-xl px-6 py-4 text-left transition-colors"
        >
          {worthOpen ? (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          )}
          <Wallet className="text-muted-foreground h-4 w-4" />
          <span className="text-base font-semibold">Total net worth</span>
        </button>
        {worthOpen && (
          <div className={cn('border-border/60 space-y-6 border-t px-6 py-6')}>
            <TotalWorthCard
              breakdown={data?.breakdown}
              netWorth={data?.netWorth}
              format={fmt}
              isLoading={isLoading}
              error={error}
              flat
            />

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
                    <p className="text-muted-foreground">
                      Chart will appear here once you add data
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
}
