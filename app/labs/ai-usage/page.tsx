'use client';

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiUsage, useAiUsageDays, type AiUsageData } from '@/lib/hooks/use-budget';

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

          <RecentMonths months={data.months} />
          <p className="text-muted-foreground text-xs">Tap a month to see its daily breakdown.</p>
        </>
      )}
    </div>
  );
}

/**
 * Recent-months list where a month row is a button that toggles a per-day
 * breakdown table beneath it. Only one month is expanded at a time to keep
 * the network + DOM footprint small; clicking a second row collapses the
 * previous one automatically.
 */
function RecentMonths({ months }: { months: AiUsageData['months'] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-card border-border rounded-lg border">
      <div className="border-border/60 border-b px-4 py-2.5 text-sm font-medium">Recent months</div>
      <div className="divide-border/60 divide-y">
        {months
          .slice()
          .reverse()
          .map((m) => {
            const isOpen = expanded === m.month;
            return (
              <div key={m.month}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : m.month)}
                  aria-expanded={isOpen}
                  className={cn(
                    'hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors',
                    isOpen && 'bg-muted/30'
                  )}
                >
                  <ChevronRight
                    className={cn(
                      'text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform',
                      isOpen && 'rotate-90'
                    )}
                  />
                  <span className="flex-1 text-left">{monthLabel(m.month)}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {m.transactionCount.toLocaleString()} txns
                  </span>
                  <span className="w-16 text-right font-medium tabular-nums">
                    {usd(m.spendUsd)}
                  </span>
                </button>
                {isOpen && <DayBreakdown month={m.month} />}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function DayBreakdown({ month }: { month: string }) {
  const { data, isLoading, error } = useAiUsageDays(month);

  return (
    <div className="bg-muted/20 border-border/50 border-t px-4 py-3">
      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading days…
        </div>
      )}
      {error && (
        <div className="text-destructive flex items-center gap-2 text-xs">
          <ChevronDown className="h-3.5 w-3.5" />
          {(error as Error).message}
        </div>
      )}
      {data && data.days.length === 0 && (
        <div className="text-muted-foreground text-xs">
          No AI-categorized transactions in this month.
        </div>
      )}
      {data && data.days.length > 0 && (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground text-[10px] tracking-wider uppercase">
            <tr>
              <th className="py-1 text-left font-medium">Day</th>
              <th className="py-1 text-right font-medium">Txns</th>
              <th className="py-1 text-right font-medium">Searches</th>
              <th className="py-1 text-right font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((d) => (
              <tr key={d.day} className="border-border/40 border-t">
                <td className="py-1 text-left">{dayLabel(d.day)}</td>
                <td className="py-1 text-right">{d.transactionCount.toLocaleString()}</td>
                <td className="py-1 text-right">{d.webSearches.toLocaleString()}</td>
                <td className="py-1 text-right font-medium">{usd(d.spendUsd, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function dayLabel(key: string): string {
  // YYYY-MM-DD → "Jul 24" (locale-agnostic day+month)
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleString(undefined, { month: 'short', day: 'numeric' });
}
