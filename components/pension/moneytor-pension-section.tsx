'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useMoneytorPension,
  useMoneytorPensionHistory,
  useSyncMoneytor,
  type MoneytorPensionFundRow,
} from '@/lib/hooks/use-moneytor';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleString();
}

function formatMonth(iso: string): string {
  const d = new Date(iso);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

function formatPct(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

function isPension(productType: string) {
  return productType.includes('פנסיה');
}

function isHishtalmut(productType: string) {
  return productType.includes('השתלמות');
}

export function MoneytorPensionSection() {
  const pensionQuery = useMoneytorPension();
  const historyQuery = useMoneytorPensionHistory();
  const sync = useSyncMoneytor();

  const funds = pensionQuery.data?.funds ?? [];
  const totals = pensionQuery.data?.totals;
  const history = historyQuery.data?.history ?? [];

  const grouped = useMemo(() => {
    const pension = funds.filter((f) => isPension(f.productType));
    const hishtalmut = funds.filter((f) => isHishtalmut(f.productType));
    const other = funds.filter((f) => !isPension(f.productType) && !isHishtalmut(f.productType));
    return { pension, hishtalmut, other };
  }, [funds]);

  // Hide the entire section when Moneytor returns nothing AND nothing is loading;
  // keeps the page clean for users who don't use Moneytor.
  if (
    !pensionQuery.isLoading &&
    funds.length === 0 &&
    history.length === 0 &&
    !pensionQuery.error
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Synced from Moneytor</h2>
          <p className="text-muted-foreground text-xs">
            From Moneytor / Masleka — last synced{' '}
            {formatRelativeTime(pensionQuery.data?.asOf ?? null)}
          </p>
        </div>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
          <RefreshCw className={cn('mr-2 h-4 w-4', sync.isPending && 'animate-spin')} />
          Sync
        </Button>
      </div>

      {(pensionQuery.error || historyQuery.error || sync.error) && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 p-4">
            <AlertCircle className="text-destructive mt-0.5 h-4 w-4" />
            <div className="text-sm">
              {(pensionQuery.error || historyQuery.error || sync.error)?.message ||
                'Failed to load pension data.'}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TotalCard label="Pension" value={totals?.pension ?? 0} accent="primary" />
        <TotalCard label="Hishtalmut" value={totals?.hishtalmut ?? 0} accent="secondary" />
        <TotalCard label="Total" value={totals?.total ?? 0} accent="strong" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-base font-semibold">Monthly history</h3>
            <span className="text-muted-foreground text-xs">
              {history.length} month{history.length === 1 ? '' : 's'}
            </span>
          </div>
          {history.length === 0 ? (
            <div className="text-muted-foreground p-6 text-center text-sm">
              No snapshots yet — run a sync to capture this month.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history.map((p) => ({ ...p, label: formatMonth(p.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number | undefined) => (v != null ? formatCurrencyILS(v) : '—')}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="pension"
                    name="Pension"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="hishtalmut"
                    name="Hishtalmut"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {pensionQuery.isLoading && funds.length === 0 ? (
        <div className="text-muted-foreground p-8 text-center text-sm">Loading…</div>
      ) : (
        <>
          {grouped.pension.length > 0 && (
            <FundsSection
              title="Pension funds (קרן פנסיה)"
              funds={grouped.pension}
              showProjections
            />
          )}
          {grouped.hishtalmut.length > 0 && (
            <FundsSection title="Hishtalmut funds (קרן השתלמות)" funds={grouped.hishtalmut} />
          )}
          {grouped.other.length > 0 && <FundsSection title="Other" funds={grouped.other} />}
          {funds.length === 0 && !pensionQuery.isLoading && (
            <div className="text-muted-foreground p-8 text-center text-sm">
              No pension or hishtalmut funds found. Run a sync to fetch them.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'primary' | 'secondary' | 'strong';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </div>
        <div
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            accent === 'primary' && 'text-blue-500',
            accent === 'secondary' && 'text-emerald-500',
            accent === 'strong' && 'text-foreground'
          )}
        >
          <span dir="ltr">{formatCurrencyILS(value)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function FundsSection({
  title,
  funds,
  showProjections,
}: {
  title: string;
  funds: MoneytorPensionFundRow[];
  showProjections?: boolean;
}) {
  const subtotal = funds.reduce((s, f) => s + f.balanceInBase, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-muted-foreground text-sm tabular-nums" dir="ltr">
          {formatCurrencyILS(subtotal)}
        </span>
      </div>
      <div className="space-y-2">
        {funds.map((f) => (
          <FundCard key={f.id} fund={f} showProjections={showProjections} />
        ))}
      </div>
    </div>
  );
}

function FundCard({
  fund,
  showProjections,
}: {
  fund: MoneytorPensionFundRow;
  showProjections?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="hover:bg-muted/40 flex w-full items-start gap-3 p-3 text-left transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{fund.name}</span>
              {fund.institution && (
                <span className="text-muted-foreground text-xs">{fund.institution}</span>
              )}
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">{fund.routeName}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums" dir="ltr">
              {formatCurrencyILS(fund.balanceInBase)}
            </div>
            {fund.profitsFromLastYear != null && (
              <div
                className={cn(
                  'text-xs tabular-nums',
                  fund.profitsFromLastYear >= 0 ? 'text-emerald-500' : 'text-rose-500'
                )}
              >
                {fund.profitsFromLastYear >= 0 ? '+' : ''}
                {fund.profitsFromLastYear.toFixed(2)}% / yr
              </div>
            )}
          </div>
          <span className="text-muted-foreground mt-0.5 shrink-0">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
        {open && (
          <div className="border-border/40 grid grid-cols-2 gap-x-3 gap-y-2 border-t p-3 text-sm sm:grid-cols-3">
            <Field label="Account" value={fund.accountNumber ?? '—'} />
            <Field label="Fund ID" value={fund.fundId ?? '—'} />
            <Field label="Owner" value={fund.accountOwner ?? '—'} />
            <Field
              label="Monthly deposit"
              value={
                fund.monthlyDepositSum != null ? formatCurrencyILS(fund.monthlyDepositSum) : '—'
              }
            />
            <Field
              label="Employee"
              value={
                fund.monthlyDepositEmployee != null
                  ? formatCurrencyILS(fund.monthlyDepositEmployee)
                  : '—'
              }
            />
            <Field
              label="Employer"
              value={
                fund.monthlyDepositEmployer != null
                  ? formatCurrencyILS(fund.monthlyDepositEmployer)
                  : '—'
              }
            />
            <Field label="Fee (savings)" value={formatPct(fund.mgmtFeeFromSavings)} />
            <Field label="Fee (deposit)" value={formatPct(fund.mgmtFeeFromDeposit)} />
            <Field label="Opened" value={fund.fundOpeningDate ?? '—'} />
            {showProjections && (
              <>
                <Field
                  label="Years to retirement"
                  value={fund.yearsToRetirement != null ? String(fund.yearsToRetirement) : '—'}
                />
                <Field
                  label="Retirement age"
                  value={fund.gilPrisha != null ? String(fund.gilPrisha) : '—'}
                />
                <Field
                  label="Projected monthly pension"
                  value={
                    fund.projectedMonthlyPension != null
                      ? formatCurrencyILS(fund.projectedMonthlyPension)
                      : '—'
                  }
                />
                <Field
                  label="Projected total"
                  value={
                    fund.projectedSavingsWithPremiums != null
                      ? formatCurrencyILS(fund.projectedSavingsWithPremiums)
                      : '—'
                  }
                />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="truncate tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  );
}
