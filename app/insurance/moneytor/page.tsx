'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useMoneytorInsurance, type MoneytorInsurancePolicyRow } from '@/lib/hooks/use-moneytor';
import { formatCurrencyILS, formatCurrencyILSCompact } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

export default function MoneytorInsurancePage() {
  const { data, isLoading, error } = useMoneytorInsurance();
  const policies = useMemo(() => data?.policies ?? [], [data]);
  const totals = data?.totals;

  const byPerson = useMemo(() => {
    const groups = new Map<string, MoneytorInsurancePolicyRow[]>();
    for (const p of policies) {
      const key = p.insuredName ?? 'Unknown';
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()];
  }, [policies]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Shield className="text-primary h-7 w-7" />
          <h1 className="page-title text-4xl font-bold tracking-tight">Insurance</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Synced from Moneytor
          {data?.asOf && ` · updated ${new Date(data.asOf).toLocaleString('en-GB')}`}
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 p-4">
            <AlertCircle className="text-destructive mt-0.5 h-4 w-4" />
            <div className="text-sm">{error.message || 'Failed to load insurance data.'}</div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted h-32 animate-pulse rounded-3xl" />
          ))}
        </div>
      )}

      {!isLoading && !error && policies.length === 0 && (
        <div className="border-border flex h-64 items-center justify-center rounded-3xl border border-dashed">
          <div className="text-center">
            <Shield className="text-muted-foreground mx-auto h-12 w-12" />
            <p className="text-muted-foreground mt-2 text-lg font-medium">No policies yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Run a Moneytor sync to pull your insurance policies
            </p>
          </div>
        </div>
      )}

      {!isLoading && !error && policies.length > 0 && totals && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Monthly cost" value={formatCurrencyILSCompact(totals.monthly)} />
            <StatCard label="Annual cost" value={formatCurrencyILSCompact(totals.annual)} />
            <StatCard label="Policies" value={String(totals.policies)} />
            <StatCard label="Companies" value={String(totals.companies)} />
          </div>

          <div className="space-y-8">
            {byPerson.map(([name, list]) => (
              <section key={name} className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold" dir="auto">
                    {name}
                  </h2>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatCurrencyILS(list.reduce((s, p) => s + p.monthlyPremium, 0))} / month
                  </span>
                </div>
                <Card className="gap-0 py-0">
                  <CardContent className="divide-border divide-y p-0">
                    {list.map((p) => (
                      <PolicyItem key={p.id} policy={p} />
                    ))}
                  </CardContent>
                </Card>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function PolicyItem({ policy }: { policy: MoneytorInsurancePolicyRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="hover:bg-muted/30 active:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-start transition-colors"
      >
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform',
            expanded && 'rotate-180'
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" dir="auto">
            {policy.title}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {[policy.categoryLabelEng, policy.companyShort ?? policy.company]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCurrencyILS(policy.monthlyPremium)}
        </span>
      </button>

      {expanded && (
        <div className="bg-muted/20 border-border/40 space-y-3 border-t px-4 pt-2 pb-3 text-xs">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <Detail label="Company" value={policy.company} />
            <Detail label="Policy number" value={policy.policyNumber} />
            <Detail label="Term" value={policy.renewalPeriod} />
            <Detail label="Annual premium" value={formatCurrencyILS(policy.annualPremium)} />
          </dl>
          {policy.coverages.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 font-medium">Coverages</p>
              <ul className="space-y-1">
                {policy.coverages.map((c, i) => (
                  <li key={i} className="flex items-start justify-between gap-4">
                    <span dir="auto">
                      {c.displayLabel ?? c.subBranch}
                      {c.planClassification && (
                        <span className="text-muted-foreground"> · {c.planClassification}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {c.monthlyPremium ? formatCurrencyILS(c.monthlyPremium) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate" dir="auto">
        {value ?? '—'}
      </dd>
    </div>
  );
}
