'use client';

import { CreditCard, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

interface InstitutionBreakdownProps {
  data: AnalysisData;
}

/**
 * Institution breakdown — the first panel on the analysis page. Groups the
 * range's expenses by payment source (individual credit cards + bank
 * transfers), sorted by spend, and calls out the credit-card total so the
 * user can compare it against a card statement at a glance.
 *
 * Rows use the friendly name from BudgetAccountName when the payment
 * identifier is mapped, and fall back to `Credit card (unmapped)` /
 * `Bank (unmapped)` for the coarse buckets.
 */
export function InstitutionBreakdown({ data }: InstitutionBreakdownProps) {
  const institutions = data.institutions ?? [];
  const creditCardTotal = institutions
    .filter((i) => i.paymentMethod === 'credit_card')
    .reduce((s, i) => s + i.totalSpent, 0);
  const bankTotal = institutions
    .filter((i) => i.paymentMethod === 'bank_transfer')
    .reduce((s, i) => s + i.totalSpent, 0);
  const grandTotal = creditCardTotal + bankTotal;

  if (institutions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Expenses by institution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No expenses in this range.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between text-base">
          <span>Expenses by institution</span>
          <span className="text-muted-foreground text-xs font-normal">
            {institutions.length} account{institutions.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Top-of-panel summary: the two big buckets. Highlight credit cards
            since that's the sum the user compares against a CC statement. */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            icon={<CreditCard className="h-4 w-4" />}
            label="Credit cards"
            value={creditCardTotal}
            emphasised
          />
          <SummaryTile icon={<Landmark className="h-4 w-4" />} label="Bank" value={bankTotal} />
        </div>

        {/* Per-account rows with a proportional spend bar. */}
        <ul className="divide-border/60 divide-y">
          {institutions.map((inst) => {
            const pct = grandTotal > 0 ? (inst.totalSpent / grandTotal) * 100 : 0;
            const isCC = inst.paymentMethod === 'credit_card';
            return (
              <li key={inst.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    isCC
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted-foreground/10 text-muted-foreground'
                  )}
                  aria-hidden
                >
                  {isCC ? <CreditCard className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inst.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {inst.transactionCount} tx · {pct.toFixed(1)}%
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(inst.totalSpent, 'ILS')}
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  emphasised,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  emphasised?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2',
        emphasised && 'border-primary/40 bg-primary/5'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          emphasised ? 'bg-primary/15 text-primary' : 'bg-muted-foreground/10 text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-base font-semibold tabular-nums">{formatCurrency(value, 'ILS')}</p>
      </div>
    </div>
  );
}
