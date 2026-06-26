'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Landmark,
  Loader2,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncLogEntry {
  id: string;
  source: 'manual' | 'cron' | string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  /**
   * Raw MoneytorSyncSummary on success. Typed loosely because the shape
   * has grown over time and we don't want this page to break on older
   * entries that pre-date a field's introduction.
   */
  results: Record<string, unknown> | null;
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function n(results: Record<string, unknown> | null, key: string): number {
  const v = results?.[key];
  return typeof v === 'number' ? v : 0;
}

function s(results: Record<string, unknown> | null, key: string): string | null {
  const v = results?.[key];
  return typeof v === 'string' ? v : null;
}

function Section({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: Array<[label: string, value: number | string | null]>;
}) {
  const visible = items.filter(([, v]) => v != null && !(typeof v === 'number' && v === 0));
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center gap-2 text-[10px] font-semibold tracking-wider uppercase">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map(([label, value]) => (
          <div key={label} className="bg-muted/40 rounded px-2 py-1.5">
            <div className="text-muted-foreground text-[10px]">{label}</div>
            <div className="text-sm font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogCard({ entry }: { entry: SyncLogEntry }) {
  const [open, setOpen] = useState(false);
  const r = entry.results;

  const durationSec = (entry.durationMs / 1000).toFixed(1);
  const sourceLabel = entry.source === 'cron' ? 'Cron' : 'Manual';

  return (
    <div className="bg-card border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        {entry.success ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle className="text-destructive h-5 w-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formatStartedAt(entry.startedAt)}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] tracking-wider uppercase',
                entry.source === 'cron'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {sourceLabel}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {entry.success ? `${durationSec}s` : `Failed in ${durationSec}s`}
            {!entry.success && entry.errorMessage ? ` — ${entry.errorMessage}` : null}
          </div>
        </div>
        <div className="text-muted-foreground shrink-0">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-border/40 space-y-4 border-t px-4 py-4">
          {!entry.success && entry.errorMessage && (
            <div className="border-destructive/40 text-destructive bg-destructive/5 rounded border px-3 py-2 text-xs">
              {entry.errorMessage}
            </div>
          )}

          <Section
            icon={ArrowLeftRight}
            title="Transactions"
            items={[
              ['Fetched', n(r, 'fetched')],
              ['Upserted', n(r, 'upserted')],
              ['Budget created', n(r, 'budgetCreated')],
              ['Budget skipped', n(r, 'budgetSkipped')],
              ['Latest date', s(r, 'latestDate')],
            ]}
          />

          <Section
            icon={TrendingUp}
            title="Portfolio (stocks)"
            items={[
              ['Stock accounts', n(r, 'stockAccounts')],
              ['Holdings upserted', n(r, 'stocksUpserted')],
              ['Snapshots upserted', n(r, 'snapshotsUpserted')],
            ]}
          />

          <Section
            icon={Landmark}
            title="Accounts (bank + debt)"
            items={[
              ['Accounts upserted', n(r, 'accountsUpserted')],
              ['Account snapshots', n(r, 'accountSnapshotsUpserted')],
            ]}
          />

          <Section
            icon={PiggyBank}
            title="Pension"
            items={[
              ['Funds upserted', n(r, 'pensionFundsUpserted')],
              ['Snapshots upserted', n(r, 'pensionSnapshotsUpserted')],
            ]}
          />

          <Section
            icon={Building2}
            title="Real estate"
            items={[
              ['Properties upserted', n(r, 'realEstateUpserted')],
              ['Snapshots upserted', n(r, 'realEstateSnapshotsUpserted')],
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function SyncLogPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['labs', 'sync-log'],
    queryFn: async () => {
      const res = await fetch('/api/labs/sync-log');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load');
      return json.data as SyncLogEntry[];
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Sync Log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every Moneytor sync attempt for this household. Each entry expands to show per-section
          counts (transactions, portfolio, accounts, pension, real estate).
        </p>
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {error && (
        <div className="border-destructive text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4" />
          {(error as Error).message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="text-muted-foreground rounded-md border px-3 py-4 text-sm">
          No sync runs yet. The next Sync data tap or daily-tasks cron will start populating this
          log.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((entry) => (
            <LogCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
