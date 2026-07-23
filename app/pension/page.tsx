'use client';

import { Building2 } from 'lucide-react';
import { usePension } from '@/lib/hooks/use-pension';
import {
  AddAccountDialog,
  AccountCard,
  MoneytorPensionSection,
  UploadDepositsDialog,
} from '@/components/pension';

export default function PensionPage() {
  const { data, isLoading, error } = usePension();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-10 flex flex-row items-center justify-between gap-4">
        <h1 className="page-title text-4xl font-bold tracking-tight">Pension & Hishtalmut</h1>
        <UploadDepositsDialog accounts={data?.accounts ?? []} />
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          Failed to load pension data. Please try again.
        </div>
      )}

      {/* Synced (Moneytor) section — hides itself when there's no data and no error. */}
      <MoneytorPensionSection />

      {/* Manual Accounts List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Accounts</h2>
          <AddAccountDialog />
        </div>

        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-muted h-48 animate-pulse rounded-lg" />
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
          <div className="border-border flex h-48 items-center justify-center rounded-lg border border-dashed">
            <div className="text-center">
              <Building2 className="text-muted-foreground mx-auto h-12 w-12" />
              <p className="text-muted-foreground mt-2">No accounts yet</p>
              <p className="text-muted-foreground text-sm">
                Add your first pension account to start tracking deposits
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
