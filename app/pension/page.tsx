'use client';

import { Building2 } from 'lucide-react';
import { usePension } from '@/lib/hooks/use-pension';
import {
  PensionSummary,
  AddAccountDialog,
  AccountCard,
} from '@/components/pension';

export default function PensionPage() {
  const { data, isLoading, error } = usePension();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Pension & Hishtalmut</h1>
          <p className="text-muted-foreground">Track your retirement and savings accounts</p>
        </div>
        <AddAccountDialog />
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          Failed to load pension data. Please try again.
        </div>
      )}

      {/* Summary Cards */}
      <PensionSummary
        totalValue={data?.totalValue ?? 0}
        thisMonthDeposits={data?.thisMonthDeposits ?? 0}
        accountsCount={data?.accountsCount ?? 0}
        isLoading={isLoading}
      />

      {/* Accounts List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Your Accounts</h2>

        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : data?.accounts && data.accounts.length > 0 ? (
          // Accounts list
          <div className="space-y-4">
            {data.accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        ) : (
          // Empty state
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
            <div className="text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No accounts yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first pension account to start tracking deposits
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
