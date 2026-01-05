'use client';

import { Wallet } from 'lucide-react';
import { useAssets } from '@/lib/hooks/use-assets';
import { AssetsSummary, AddAssetDialog, AssetList } from '@/components/assets';

export default function AssetsPage() {
  const { data, isLoading, error } = useAssets();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Misc Assets & Debt</h1>
          <p className="text-muted-foreground">
            Track bank deposits, loans, mortgages, and savings
          </p>
        </div>
        <AddAssetDialog />
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          Failed to load assets data. Please try again.
        </div>
      )}

      {/* Summary Cards */}
      <AssetsSummary
        totalAssets={data?.totalAssets ?? 0}
        totalLiabilities={data?.totalLiabilities ?? 0}
        netValue={data?.netValue ?? 0}
        isLoading={isLoading}
      />

      {/* Assets & Liabilities List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Your Assets & Liabilities</h2>

        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-32 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : data?.items && data.items.length > 0 ? (
          // Assets list
          <AssetList items={data.items} />
        ) : (
          // Empty state
          <div className="border-border flex h-48 items-center justify-center rounded-lg border border-dashed">
            <div className="text-center">
              <Wallet className="text-muted-foreground mx-auto h-12 w-12" />
              <p className="text-muted-foreground mt-2">No assets or liabilities yet</p>
              <p className="text-muted-foreground text-sm">
                Add bank deposits, loans, mortgages, or child savings to track
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
