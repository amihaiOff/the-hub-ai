'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Landmark, Percent, Wallet } from 'lucide-react';
import { useMoneytorAccounts, type MoneytorAccountRow } from '@/lib/hooks/use-moneytor';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

/** Same beige/gold accent the real-estate panel uses. */
const GOLD = 'text-[#d4b878]';

/**
 * A debt row is treated as a mortgage when its name contains the Hebrew
 * word "משכנתא" or the English "mortgage". This is the only reliable
 * signal the Moneytor API surfaces — `debtType: "loan"` is the same as
 * credit cards, and the `linkedMortgage` reference back-pointer is
 * mangled in their response.
 */
function isMortgage(account: MoneytorAccountRow): boolean {
  if (account.form !== 'debt') return false;
  const name = account.name ?? '';
  return name.includes('משכנתא') || /mortgage/i.test(name);
}

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

function MortgageCard({ m }: { m: MoneytorAccountRow }) {
  const [open, setOpen] = useState(false);
  // Balance comes back signed (negative for debts). The card shows the
  // absolute outstanding amount — sign is implicit in "outstanding balance".
  const outstanding = Math.abs(m.balanceInBase);
  const tracks = m.tracks ?? [];

  return (
    <div className="bg-card border-border rounded-lg border">
      {/* Header — RTL so the Hebrew name + institution sit on the right next
          to the Landmark icon tile, matching the real-estate card layout. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        dir="rtl"
        className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-right transition-colors"
        aria-expanded={open}
      >
        <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Landmark className="text-primary h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{m.name}</p>
          {m.institution && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{m.institution}</p>
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
            <h3 className="mb-4 text-xl font-bold">Mortgage Overview</h3>
            <div className="space-y-4">
              <Field
                label="Outstanding balance"
                value={formatCurrencyILS(outstanding)}
                valueClassName={GOLD}
              />
              {m.monthlyPayment != null && m.monthlyPayment > 0 && (
                <Field
                  label="Monthly payment"
                  value={formatCurrencyILS(m.monthlyPayment)}
                  valueClassName={GOLD}
                />
              )}
              {m.interestRate != null && (
                <Field
                  label="Avg. interest"
                  value={`${m.interestRate.toFixed(2)}%`}
                  hint="Weighted by remaining principal"
                />
              )}
            </div>
          </div>

          <div className="border-border/40 border-t" />

          {/* Loan details | Key facts — always side-by-side */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <div>
              <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                Loan details
              </h4>
              <div className="space-y-4">
                {m.institution && <Field label="Lender" value={m.institution} />}
                {m.startDate && <Field label="Start date" value={m.startDate} />}
                {m.maturityDate && <Field label="Maturity" value={m.maturityDate} />}
              </div>
            </div>

            <div>
              <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                Key facts
              </h4>
              <div className="space-y-4">
                <SpecRow icon={Wallet} label="Outstanding" value={formatCurrencyILS(outstanding)} />
                {m.interestRate != null && (
                  <SpecRow
                    icon={Percent}
                    label="Interest"
                    value={`${m.interestRate.toFixed(2)}%`}
                  />
                )}
                {m.startDate && <SpecRow icon={CalendarDays} label="Since" value={m.startDate} />}
              </div>
            </div>
          </div>

          {/* Tracks — multi-route mortgages break down the principal across
              fixed-CPI-linked, fixed-nominal, prime, etc. */}
          {tracks.length > 0 && (
            <>
              <div className="border-border/40 border-t" />
              <div>
                <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                  Tracks ({tracks.length})
                </h4>
                <div className="space-y-2">
                  {tracks.map((t, i) => (
                    <div
                      key={i}
                      className="bg-muted/40 grid grid-cols-2 gap-3 rounded-md px-3 py-2 sm:grid-cols-4"
                    >
                      <Field
                        label="Type"
                        value={<span className="text-sm font-medium">{t.interestType ?? '—'}</span>}
                      />
                      {t.remainder != null && (
                        <Field
                          label="Remainder"
                          value={
                            <span className="text-sm font-bold">
                              {formatCurrencyILS(t.remainder)}
                            </span>
                          }
                          valueClassName={GOLD}
                        />
                      )}
                      {t.interest != null && (
                        <Field
                          label="Interest"
                          value={<span className="text-sm font-bold">{t.interest}%</span>}
                        />
                      )}
                      {t.monthlyRepayment != null && t.monthlyRepayment > 0 && (
                        <Field
                          label="Monthly"
                          value={
                            <span className="text-sm font-bold">
                              {formatCurrencyILS(t.monthlyRepayment)}
                            </span>
                          }
                          valueClassName={GOLD}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MortgagesSection() {
  const { data } = useMoneytorAccounts();
  const mortgages = (data?.accounts ?? []).filter(isMortgage);

  if (mortgages.length === 0) return null;

  const total = mortgages.reduce((s, m) => s + Math.abs(m.balanceInBase), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Liabilities</h2>
        <span className="text-destructive text-sm tabular-nums">−{formatCurrencyILS(total)}</span>
      </div>
      <div className="space-y-2">
        {mortgages.map((m) => (
          <MortgageCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
