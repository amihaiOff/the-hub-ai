'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useAiUsage, type AiUsageData } from '@/lib/hooks/use-budget';

function usd(n: number, decimals = 2): string {
  return `$${n.toFixed(decimals)}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
}

const COMPONENTS: {
  key: keyof AiUsageData['currentMonth']['breakdown'];
  label: string;
  hint: string;
}[] = [
  { key: 'inputUsd', label: 'Input tokens', hint: 'Prompt sent to the model' },
  { key: 'outputUsd', label: 'Output tokens', hint: "Model's response" },
  { key: 'cacheWriteUsd', label: 'Cache write', hint: 'First-time caching of the prompt' },
  { key: 'cacheReadUsd', label: 'Cache read', hint: 'Reused cached prompt (cheap)' },
  { key: 'searchUsd', label: 'Web search', hint: 'Merchant lookups' },
];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border-border rounded-lg border px-4 py-3">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

function Breakdown({ data }: { data: AiUsageData }) {
  const { breakdown, tokens } = data.currentMonth;
  const total = breakdown.totalUsd;
  const tokenByKey: Record<string, string> = {
    inputUsd: `${tokens.input.toLocaleString()} tok`,
    outputUsd: `${tokens.output.toLocaleString()} tok`,
    cacheWriteUsd: `${tokens.cacheCreation.toLocaleString()} tok`,
    cacheReadUsd: `${tokens.cacheRead.toLocaleString()} tok`,
    searchUsd: `${tokens.webSearches.toLocaleString()} searches`,
  };

  return (
    <div className="bg-card border-border rounded-lg border">
      <div className="border-border/60 border-b px-4 py-2.5 text-sm font-medium">
        This month by component
      </div>
      <div className="divide-border/60 divide-y">
        {COMPONENTS.map((c) => {
          const cost = breakdown[c.key];
          const pct = total > 0 ? (cost / total) * 100 : 0;
          return (
            <div key={c.key} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {c.hint} · {tokenByKey[c.key]}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{usd(cost, 3)}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {pct.toFixed(0)}%
                  </div>
                </div>
              </div>
              <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AiUsagePage() {
  const { data, isLoading, error } = useAiUsage();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="page-title text-4xl font-bold tracking-tight">AI Spend</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Estimated cost of AI auto-categorization for this household, from recorded token and
          web-search usage. Figures are derived from Anthropic&apos;s Haiku 4.5 rates — treat as a
          close estimate, and cross-check the Anthropic Console for the authoritative bill.
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

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label={`Spent — ${monthLabel(data.currentMonth.month)}`}
              value={usd(data.currentMonth.spendUsd)}
              sub={`${data.currentMonth.transactionCount.toLocaleString()} transactions categorized`}
            />
            <Stat
              label="Avg / transaction"
              value={usd(data.currentMonth.avgCostUsd, 4)}
              sub="This month"
            />
            <Stat
              label="Web searches"
              value={data.currentMonth.tokens.webSearches.toLocaleString()}
              sub={`${usd(data.currentMonth.breakdown.searchUsd, 2)} at $${data.pricing.perWebSearch.toFixed(3)}/search`}
            />
          </div>

          {data.currentMonth.transactionCount === 0 ? (
            <div className="text-muted-foreground rounded-md border px-3 py-4 text-sm">
              No AI categorizations recorded this month yet.
            </div>
          ) : (
            <Breakdown data={data} />
          )}

          <div className="bg-card border-border rounded-lg border">
            <div className="border-border/60 border-b px-4 py-2.5 text-sm font-medium">
              Recent months
            </div>
            <div className="divide-border/60 divide-y">
              {data.months
                .slice()
                .reverse()
                .map((m) => (
                  <div
                    key={m.month}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span>{monthLabel(m.month)}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {m.transactionCount.toLocaleString()} txns
                    </span>
                    <span className="font-medium tabular-nums">{usd(m.spendUsd)}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
