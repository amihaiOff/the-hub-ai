'use client';

import { AssetCard } from './asset-card';
import { type MiscAsset, separateAssetsByType } from '@/lib/utils/assets';

interface AssetListProps {
  items: MiscAsset[];
  isLoading?: boolean;
}

export function AssetList({ items, isLoading }: AssetListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-32 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          No assets or liabilities added yet. Click &quot;Add Asset&quot; to get started.
        </p>
      </div>
    );
  }

  const { assets, liabilities } = separateAssetsByType(items);

  return (
    <div className="space-y-8">
      {/* Assets section */}
      {assets.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            Assets ({assets.length})
          </h3>
          <div className="grid gap-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        </div>
      )}

      {/* Liabilities section */}
      {liabilities.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
            Liabilities ({liabilities.length})
          </h3>
          <div className="grid gap-4">
            {liabilities.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
