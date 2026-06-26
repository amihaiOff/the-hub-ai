'use client';

import { useState } from 'react';
import {
  BedDouble,
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  SquarePlus,
} from 'lucide-react';
import { useMoneytorRealEstate, type MoneytorRealEstateRow } from '@/lib/hooks/use-moneytor';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

/**
 * Beige/gold tone used to make currency values pop in the details panel.
 * Picked to match the warmer headline tone the user landed on for the
 * Transactions title — readable on the dark Card background without
 * clashing with the primary blue.
 */
const GOLD = 'text-[#d4b878]';

function Field({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className={cn('mt-0.5 text-lg font-bold tabular-nums', valueClassName)}>{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

function SpecRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        <Icon className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          {label}
        </p>
        <p className="text-base font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function PropertyCard({ p }: { p: MoneytorRealEstateRow }) {
  const [open, setOpen] = useState(false);
  const ownershipShare = p.ownership != null && p.ownership < 100;

  // Approximate net proceeds if sold today, after sale costs.
  const commissionPct = p.saleCommission ?? 0;
  const estimatedNetSale =
    p.currentValue -
    (p.currentValue * commissionPct) / 100 -
    (p.generalSellingExpenses ?? 0) -
    (p.legalExpenses ?? 0) -
    (p.profitTax ?? 0);

  const areaUnit = p.measurementUnit === 'squareFoot' ? 'sqft' : 'm²';

  return (
    <div className="bg-card border-border rounded-lg border">
      {/* Header — RTL so Hebrew name + address sit on the right, icon tile on
          the left visually mirrors the Building2 chip in the mockup. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        dir="rtl"
        className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-right transition-colors"
        aria-expanded={open}
      >
        <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Building2 className="text-primary h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-end gap-2">
            <p className="truncate font-bold">{p.name}</p>
            {ownershipShare && (
              <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[10px]">
                {p.ownership}%
              </span>
            )}
          </div>
          {p.address && (
            <div className="text-muted-foreground mt-0.5 flex items-center justify-end gap-1 text-xs">
              <span className="truncate">{p.address}</span>
              <MapPin className="h-3 w-3 shrink-0" />
            </div>
          )}
        </div>
        <div className="text-muted-foreground shrink-0">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-border/40 space-y-6 border-t px-4 py-5">
          {/* Financial Overview */}
          <div>
            <h3 className="mb-4 text-xl font-bold">Financial Overview</h3>
            <div className="space-y-4">
              <Field label="Market value" value={formatCurrencyILS(p.currentValue)} />
              {ownershipShare && (
                <Field
                  label="Your share"
                  value={formatCurrencyILS(p.balanceInBase)}
                  hint={`${p.ownership}% ownership`}
                  valueClassName={GOLD}
                />
              )}
              <Field
                label="Est. net on sale"
                value={formatCurrencyILS(estimatedNetSale)}
                hint="After commission, legal, tax"
                valueClassName={GOLD}
              />
            </div>
          </div>

          <div className="border-border/40 border-t" />

          {/* Two-column: Purchase + income | Property specs */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Purchase details & income */}
            {(p.purchasePrice != null ||
              p.purchaseDate ||
              p.purchaseExpenses != null ||
              p.rent != null) && (
              <div>
                <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                  Purchase details & income
                </h4>
                <div className="space-y-4">
                  {p.purchasePrice != null && (
                    <Field
                      label="Purchase price"
                      value={formatCurrencyILS(p.purchasePrice)}
                      valueClassName={GOLD}
                    />
                  )}
                  {p.purchaseDate && <Field label="Date" value={p.purchaseDate} />}
                  {p.purchaseExpenses != null && (
                    <Field
                      label="Purchase expenses"
                      value={formatCurrencyILS(p.purchaseExpenses)}
                      valueClassName={GOLD}
                    />
                  )}
                  {p.rent != null && p.rent > 0 && (
                    <Field
                      label="Rent"
                      value={formatCurrencyILS(p.rent)}
                      valueClassName={GOLD}
                      hint={
                        [p.rentType, p.incomeFrequency].filter(Boolean).join(' · ') || undefined
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* Property specs */}
            {(p.builtArea != null || p.bedrooms != null || p.floor != null) && (
              <div>
                <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                  Property specs
                </h4>
                <div className="space-y-4">
                  {p.builtArea != null && (
                    <SpecRow icon={SquarePlus} label="Area" value={`${p.builtArea} ${areaUnit}`} />
                  )}
                  {p.bedrooms != null && (
                    <SpecRow icon={BedDouble} label="Bedrooms" value={p.bedrooms} />
                  )}
                  {p.floor != null && (
                    <SpecRow
                      icon={Building2}
                      label="Floor"
                      value={p.apartmentFloors ? `${p.floor} / ${p.apartmentFloors}` : p.floor}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sale costs */}
          {(p.saleCommission != null ||
            p.generalSellingExpenses != null ||
            p.legalExpenses != null ||
            p.profitTax != null) && (
            <>
              <div className="border-border/40 border-t" />
              <div>
                <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                  Sale costs
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  {p.saleCommission != null && (
                    <Field label="Commission" value={`${p.saleCommission}%`} />
                  )}
                  {p.generalSellingExpenses != null && (
                    <Field
                      label="Selling exp."
                      value={formatCurrencyILS(p.generalSellingExpenses)}
                      valueClassName={GOLD}
                    />
                  )}
                  {p.legalExpenses != null && (
                    <Field
                      label="Legal"
                      value={formatCurrencyILS(p.legalExpenses)}
                      valueClassName={GOLD}
                    />
                  )}
                  {p.profitTax != null && p.profitTax > 0 && (
                    <Field
                      label="Tax"
                      value={formatCurrencyILS(p.profitTax)}
                      valueClassName={GOLD}
                    />
                  )}
                </div>
              </div>
            </>
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

  // Silent when empty — no value in showing "Real Estate (0)" if the user
  // has no properties in Moneytor.
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
