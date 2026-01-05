'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, CalendarDays, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pension';

interface PensionSummaryProps {
  totalValue: number;
  thisMonthDeposits: number;
  accountsCount: number;
  isLoading?: boolean;
}

export function PensionSummary({
  totalValue,
  thisMonthDeposits,
  accountsCount,
  isLoading,
}: PensionSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalValue)}</div>
              <p className="text-muted-foreground text-xs">Across all accounts</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">This Month</CardTitle>
          <CalendarDays className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-32 animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">
                {formatCurrency(thisMonthDeposits)}
              </div>
              <p className="text-muted-foreground text-xs">Deposits recorded</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Accounts</CardTitle>
          <Building2 className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="bg-muted h-8 w-16 animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">{accountsCount}</div>
              <p className="text-muted-foreground text-xs">Pension & Hishtalmut</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
