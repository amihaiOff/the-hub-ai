'use client';

import { useAssets } from '@/lib/hooks/use-assets';
import { useMoneytorAccounts, useMoneytorRealEstate } from '@/lib/hooks/use-moneytor';
import { AssetsSummary, AddAssetDialog, AssetList } from '@/components/assets';
import { isMortgage } from '@/components/assets/mortgages-section';

export default function AssetsPage() {
  const { data, isLoading, error } = useAssets();
  const { data: realEstateData } = useMoneytorRealEstate();
  const { data: accountsData } = useMoneytorAccounts();

  const realEstate = realEstateData?.properties ?? [];
  const mortgages = (accountsData?.accounts ?? []).filter(isMortgage);

  // Roll Moneytor totals into the summary cards so the headline numbers
  // reflect both manual entries and the Moneytor-synced assets/debts.
  const moneytorAssetsTotal = realEstate.reduce((s, p) => s + p.balanceInBase, 0);
  const moneytorLiabilitiesTotal = mortgages.reduce((s, m) => s + Math.abs(m.balanceInBase), 0);
  const combinedAssets = (data?.totalAssets ?? 0) + moneytorAssetsTotal;
  const combinedLiabilities = (data?.totalLiabilities ?? 0) + moneytorLiabilitiesTotal;
  const combinedNet = combinedAssets - combinedLiabilities;

  const hasAnything =
    (data?.items && data.items.length > 0) || realEstate.length > 0 || mortgages.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="page-title text-4xl font-bold tracking-tight">
        Assets & Liabilities
      </h1>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          Failed to load assets data. Please try again.
        </div>
      )}

      {/* Summary Cards — combined manual + Moneytor */}
      <AssetsSummary
        totalAssets={combinedAssets}
        totalLiabilities={combinedLiabilities}
        netValue={combinedNet}
        isLoading={isLoading}
      />

      {/* Combined list — real estate + manual assets on top, mortgages + manual liabilities below */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <AddAssetDialog />
        </div>

        {isLoading && !hasAnything ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-32 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : (
          <AssetList items={data?.items ?? []} realEstate={realEstate} mortgages={mortgages} />
        )}
      </div>
    </div>
  );
}
