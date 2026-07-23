'use client';

import { AssetCard } from './asset-card';
import { PropertyCard } from './real-estate-section';
import { MortgageCard } from './mortgages-section';
import { type MiscAsset, separateAssetsByType } from '@/lib/utils/assets';

/**
 * A mortgage carrying simulated tracks is flattened into one virtual asset
 * per track — each track gets its own card at the top level of the list,
 * per the user's product decision. Non-simulated mortgages (legacy manual
 * entries) render as a single card unchanged.
 */
function expandMortgageTracks(items: MiscAsset[]): MiscAsset[] {
  const out: MiscAsset[] = [];
  for (const item of items) {
    const tracks = item.mortgageTracks ?? [];
    const anySimulated = tracks.some((t) => t.simulated != null);
    if (item.type !== 'mortgage' || !anySimulated) {
      out.push(item);
      continue;
    }
    for (const track of tracks) {
      out.push({
        ...item,
        id: track.id ?? `${item.id}-${track.name}`,
        name: `${item.name} · ${track.name}`,
        currentValue: -Math.abs(track.amount), // mortgage → liability sign
        interestRate: track.interestRate,
        monthlyPayment: track.monthlyPayment,
        mortgageTracks: [track],
      });
    }
  }
  return out;
}
import { formatCurrencyILS } from '@/lib/utils/budget';
import type { MoneytorAccountRow, MoneytorRealEstateRow } from '@/lib/hooks/use-moneytor';

interface AssetListProps {
  items: MiscAsset[];
  /** Moneytor real-estate properties — rendered alongside manual assets. */
  realEstate?: MoneytorRealEstateRow[];
  /** Moneytor mortgage rows — rendered alongside manual liabilities. */
  mortgages?: MoneytorAccountRow[];
  isLoading?: boolean;
}

export function AssetList({ items, realEstate = [], mortgages = [], isLoading }: AssetListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-32 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const expandedItems = expandMortgageTracks(items);
  const { assets, liabilities } = separateAssetsByType(expandedItems);

  const assetsCount = assets.length + realEstate.length;
  const liabilitiesCount = liabilities.length + mortgages.length;

  // Combined totals so each section header can show "what's on this side of
  // the balance sheet". Manual amounts already carry sign via `amount`; for
  // Moneytor real estate we take the household's share (`balanceInBase`) and
  // for mortgages we sum the absolute outstanding.
  const assetsTotal =
    assets.reduce((s, a) => s + Number(a.currentValue), 0) +
    realEstate.reduce((s, p) => s + p.balanceInBase, 0);
  const liabilitiesTotal =
    liabilities.reduce((s, a) => s + Math.abs(Number(a.currentValue)), 0) +
    mortgages.reduce((s, m) => s + Math.abs(m.balanceInBase), 0);

  if (assetsCount === 0 && liabilitiesCount === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">
          No assets or liabilities added yet. Click &quot;Add Asset&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Assets — real estate first (typically biggest), then manual */}
      {assetsCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              Assets ({assetsCount})
            </h3>
            <span className="text-sm text-emerald-600 tabular-nums dark:text-emerald-400">
              {formatCurrencyILS(assetsTotal)}
            </span>
          </div>
          <div className="grid gap-2">
            {realEstate.map((p) => (
              <PropertyCard key={`re-${p.id}`} p={p} />
            ))}
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </section>
      )}

      {/* Liabilities — mortgages first, then manual */}
      {liabilitiesCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Liabilities ({liabilitiesCount})
            </h3>
            <span className="text-sm text-red-600 tabular-nums dark:text-red-400">
              −{formatCurrencyILS(liabilitiesTotal)}
            </span>
          </div>
          <div className="grid gap-2">
            {mortgages.map((m) => (
              <MortgageCard key={`mt-${m.id}`} m={m} />
            ))}
            {liabilities.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
