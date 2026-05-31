'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MonthSelector } from '@/components/budget/month-selector';
import { MoneytorTransactionTable } from '@/components/moneytor/moneytor-transaction-table';
import { MoneytorStocksSection } from '@/components/moneytor/moneytor-stocks-section';
import { getCurrentMonth } from '@/lib/utils/budget';
import {
  useMoneytorTransactions,
  useMoneytorStocks,
  useSyncMoneytor,
  type MoneytorTransactionFilters,
} from '@/lib/hooks/use-moneytor';

const ALL_CATEGORIES = '__all__';
const ALL_TYPES = '__all__';

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

export default function MoneytorTrnxPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [type, setType] = useState<string>(ALL_TYPES);

  const filters: MoneytorTransactionFilters = useMemo(
    () => ({
      month: selectedMonth,
      search: search.trim() || undefined,
      category: category === ALL_CATEGORIES ? undefined : category,
      type: type === ALL_TYPES ? undefined : type,
    }),
    [selectedMonth, search, category, type]
  );

  const { data, isLoading, error } = useMoneytorTransactions(filters);
  const stocksQuery = useMoneytorStocks();
  const sync = useSyncMoneytor();

  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const categories = data?.categories ?? [];
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) set.add(t.type);
    return Array.from(set).sort();
  }, [transactions]);

  const syncError = sync.error as (Error & { code?: string; renewUrl?: string }) | null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Moneytor Trnx</h1>
        <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
      </div>

      {/* Error State (list) */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load transactions</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'Unexpected error'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Error */}
      {syncError && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="text-destructive font-medium">Sync failed</p>
              <p className="text-muted-foreground text-sm">{syncError.message}</p>
              {syncError.code === 'token_expired' && (
                <a
                  href={syncError.renewUrl || 'https://app.moneytor.co.il/settings#api'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary mt-1 inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Renew Moneytor API token <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Sync */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="shrink-0">
          <RefreshCw className={sync.isPending ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          {sync.isPending ? 'Syncing...' : 'Sync now'}
        </Button>
      </div>

      {/* Stocks Section */}
      <MoneytorStocksSection
        accounts={stocksQuery.data?.accounts ?? []}
        isLoading={stocksQuery.isLoading}
      />

      {/* Count + last sync */}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{isLoading ? 'Loading...' : `${transactions.length} transactions`}</span>
        <span>
          Last sync: {formatRelativeTime(data?.latestSyncedAt ?? null)}
          {sync.isSuccess && sync.data && (
            <span className="ml-2">
              (+{sync.data.upserted} txns, {sync.data.stocksUpserted} stocks)
            </span>
          )}
        </span>
      </div>

      <MoneytorTransactionTable transactions={transactions} isLoading={isLoading} />
    </div>
  );
}
