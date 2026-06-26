'use client';

import { Wallet } from 'lucide-react';
import { useAssets } from '@/lib/hooks/use-assets';
import {
  AssetsSummary,
  AddAssetDialog,
  AssetList,
  RealEstateSection,
  MortgagesSection,
} from '@/components/assets';

export default function AssetsPage() {
  const { data, isLoading, error } = useAssets();

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Misc Assets & Debt</h1>

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

      {/* Real Estate (from Moneytor) — renders nothing when there are no properties */}
      <RealEstateSection />

      {/* Mortgages (from Moneytor debt rows) — renders nothing when none */}
      <MortgagesSection />

      {/* Assets & Liabilities List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Assets & Liabilities</h2>
          <AddAssetDialog />
        </div>

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
