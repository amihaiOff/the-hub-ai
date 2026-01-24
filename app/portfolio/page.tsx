'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { usePortfolio } from '@/lib/hooks/use-portfolio';
import { calculateAllocation } from '@/lib/utils/portfolio';
import { CurrencyProvider } from '@/lib/contexts/currency-context';
import {
  AddAccountDialog,
  PortfolioSummary,
  AccountCard,
  AllocationChart,
  PortfolioGainsChart,
} from '@/components/portfolio';

function PortfolioContent() {
  const { data: portfolio, isLoading, error } = usePortfolio();

  // Calculate allocation from portfolio data
  const allocation = portfolio?.accounts ? calculateAllocation(portfolio.accounts) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Stock Portfolio</h1>
        <p className="text-muted-foreground">Manage your stock holdings and brokerage accounts</p>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load portfolio</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Summary */}
      <PortfolioSummary
        totalValue={portfolio?.totalValue ?? 0}
        totalGainLoss={portfolio?.totalGainLoss ?? 0}
        totalGainLossPercent={portfolio?.totalGainLossPercent ?? 0}
        totalHoldings={portfolio?.totalHoldings ?? 0}
        isLoading={isLoading}
      />

      {/* Portfolio Performance Chart */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <PortfolioGainsChart
            currentValue={portfolio?.totalValue ?? 0}
            totalGainLoss={portfolio?.totalGainLoss ?? 0}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Accounts List - Takes 2 columns on large screens */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Brokerage Accounts</h2>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
              <AddAccountDialog />
            </div>
          </div>

          {isLoading ? (
            // Loading skeleton
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center">
                  <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                </div>
              </CardContent>
            </Card>
          ) : portfolio?.accounts && portfolio.accounts.length > 0 ? (
            // Accounts list
            <div className="space-y-4">
              {portfolio.accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          ) : (
            // Empty state
            <Card>
              <CardHeader>
                <CardTitle>Brokerage Accounts</CardTitle>
                <CardDescription>Your stock brokerage accounts and holdings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-border flex h-48 items-center justify-center rounded-lg border border-dashed">
                  <div className="text-center">
                    <TrendingUp className="text-muted-foreground mx-auto h-12 w-12" />
                    <p className="text-muted-foreground mt-2">No accounts yet</p>
                    <p className="text-muted-foreground text-sm">
                      Add your first brokerage account to start tracking
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Allocation Chart - Takes 1 column on large screens */}
        <div className="lg:self-start">
          <AllocationChart allocation={allocation} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <CurrencyProvider>
      <PortfolioContent />
    </CurrencyProvider>
  );
}
