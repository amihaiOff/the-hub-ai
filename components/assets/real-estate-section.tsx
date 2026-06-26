'use client';

import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Loader2, MapPin } from 'lucide-react';
import { useMoneytorRealEstate, type MoneytorRealEstateRow } from '@/lib/hooks/use-moneytor';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-[10px]">{hint}</p>}
    </div>
  );
}

function PropertyCard({ p }: { p: MoneytorRealEstateRow }) {
  const [open, setOpen] = useState(false);
  const ownershipShare = p.ownership != null && p.ownership < 100;
  const valueWithShare = ownershipShare ? p.balanceInBase : p.currentValue;

  // Approximate net proceeds if sold today, before tax:
  //   value - (saleCommission% * value) - generalSellingExpenses - legalExpenses
  // Used as a rough "what would I clear" indicator. Falls back to currentValue
  // when sale-cost fields aren't populated.
  const commissionPct = p.saleCommission ?? 0;
  const estimatedNetSale =
    p.currentValue -
    (p.currentValue * commissionPct) / 100 -
    (p.generalSellingExpenses ?? 0) -
    (p.legalExpenses ?? 0) -
    (p.profitTax ?? 0);

  return (
    <div className="bg-card border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Building2 className="text-primary h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{p.name}</p>
            {ownershipShare && (
              <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[10px]">
                {p.ownership}%
              </span>
            )}
          </div>
          {p.address && (
            <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{p.address}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">
            {formatCurrencyILS(valueWithShare)}
          </p>
          {p.rent != null && p.rent > 0 && (
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatCurrencyILS(p.rent)} / mo
            </p>
          )}
        </div>
        <div className="text-muted-foreground shrink-0">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className={cn('border-border/40 space-y-4 border-t px-4 py-4')}>
          {/* Value & ownership */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Market value" value={formatCurrencyILS(p.currentValue)} />
            {ownershipShare && (
              <Stat
                label="Your share"
                value={formatCurrencyILS(p.balanceInBase)}
                hint={`${p.ownership}% ownership`}
              />
            )}
            <Stat
              label="Est. net on sale"
              value={formatCurrencyILS(estimatedNetSale)}
              hint="After commission, legal, tax"
            />
          </div>

          {/* Purchase */}
          {(p.purchasePrice != null || p.purchaseDate || p.purchaseExpenses != null) && (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Purchase
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.purchasePrice != null && (
                  <Stat label="Price" value={formatCurrencyILS(p.purchasePrice)} />
                )}
                {p.purchaseDate && <Stat label="Date" value={p.purchaseDate} />}
                {p.purchaseExpenses != null && (
                  <Stat label="Expenses" value={formatCurrencyILS(p.purchaseExpenses)} />
                )}
              </div>
            </div>
          )}

          {/* Income */}
          {(p.rent != null || p.rentSuggestion != null) && (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Income
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.rent != null && (
                  <Stat
                    label="Rent"
                    value={formatCurrencyILS(p.rent)}
                    hint={[p.rentType, p.incomeFrequency].filter(Boolean).join(' · ')}
                  />
                )}
                {p.rentSuggestion != null && (
                  <Stat label="Suggested" value={formatCurrencyILS(p.rentSuggestion)} />
                )}
              </div>
            </div>
          )}

          {/* Property details */}
          {(p.builtArea != null ||
            p.bedrooms != null ||
            p.floor != null ||
            p.propertyType ||
            p.propertyCondition) && (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Property
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.propertyType && <Stat label="Type" value={p.propertyType} />}
                {p.propertyCondition && <Stat label="Condition" value={p.propertyCondition} />}
                {p.builtArea != null && (
                  <Stat
                    label="Area"
                    value={`${p.builtArea} ${p.measurementUnit === 'squareFoot' ? 'sqft' : 'm²'}`}
                  />
                )}
                {p.bedrooms != null && <Stat label="Bedrooms" value={p.bedrooms} />}
                {p.floor != null && (
                  <Stat
                    label="Floor"
                    value={p.apartmentFloors ? `${p.floor} / ${p.apartmentFloors}` : p.floor}
                  />
                )}
                {p.gardenBalconySize != null && p.gardenBalconySize > 0 && (
                  <Stat label="Garden / balcony" value={`${p.gardenBalconySize} m²`} />
                )}
              </div>
            </div>
          )}

          {/* Sale costs */}
          {(p.saleCommission != null ||
            p.generalSellingExpenses != null ||
            p.legalExpenses != null ||
            p.profitTax != null) && (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Sale costs
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {p.saleCommission != null && (
                  <Stat label="Commission" value={`${p.saleCommission}%`} />
                )}
                {p.generalSellingExpenses != null && (
                  <Stat label="Selling exp." value={formatCurrencyILS(p.generalSellingExpenses)} />
                )}
                {p.legalExpenses != null && (
                  <Stat label="Legal" value={formatCurrencyILS(p.legalExpenses)} />
                )}
                {p.profitTax != null && p.profitTax > 0 && (
                  <Stat label="Tax" value={formatCurrencyILS(p.profitTax)} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RealEstateSection() {
  const { data, isLoading, error } = useMoneytorRealEstate();
  const properties = data?.properties ?? [];

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading real estate…
      </div>
    );
  }

  // Silent when empty — there's no value showing "Real Estate (0)" on the
  // assets page if the user has no properties in Moneytor.
  if (error || properties.length === 0) return null;

  const total = data?.totals.realEstate ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Real Estate</h2>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatCurrencyILS(total)}
        </span>
      </div>
      <div className="space-y-2">
        {properties.map((p) => (
          <PropertyCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
