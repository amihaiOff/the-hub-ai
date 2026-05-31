'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMoneytorAccounts, type MoneytorAccountRow } from '@/lib/hooks/use-moneytor';
import { cn } from '@/lib/utils';

function formatIls(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString();
}

function AccountRow({ account }: { account: MoneytorAccountRow }) {
  const isDebt = account.form === 'debt';
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {[account.institution, account.subtype].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <div
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          isDebt ? 'text-red-600 dark:text-red-400' : 'text-foreground'
        )}
      >
        {formatIls(account.balanceInBase)}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-muted-foreground text-sm">
      No Moneytor accounts synced yet. Click <span className="font-medium">Sync now</span> on{' '}
      <Link href="/moneytor-trnx" className="underline">
        Moneytor Trnx
      </Link>{' '}
      to pull bank and debt balances.
    </p>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-muted h-3 w-1/4 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-4 w-20 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export function MoneytorBalancesCard() {
  const { data, isLoading } = useMoneytorAccounts();

  const accounts = data?.accounts ?? [];
  const banks = accounts.filter((a) => a.form === 'bank');
  const debts = accounts.filter((a) => a.form === 'debt');
  const totals = data?.totals;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Moneytor Balances</CardTitle>
          <p className="text-muted-foreground text-xs">
            Synced from Moneytor · not included in Net Worth above
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton />
        ) : accounts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                Bank Accounts
              </h3>
              {banks.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-sm">No bank accounts.</p>
              ) : (
                <div className="divide-border mt-1 divide-y">
                  {banks.map((a) => (
                    <AccountRow key={a.id} account={a} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                Debts / Credit Cards
              </h3>
              {debts.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-sm">No debts.</p>
              ) : (
                <div className="divide-border mt-1 divide-y">
                  {debts.map((a) => (
                    <AccountRow key={a.id} account={a} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {totals && accounts.length > 0 && (
          <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
            <span>
              Banks total{' '}
              <span className="text-foreground font-semibold">{formatIls(totals.bank)}</span> ·
              Debts total{' '}
              <span className="text-foreground font-semibold">{formatIls(totals.debt)}</span> · Net{' '}
              <span className="text-foreground font-semibold">{formatIls(totals.netInScope)}</span>
            </span>
            <span>Synced {formatRelative(data?.asOf ?? null)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
