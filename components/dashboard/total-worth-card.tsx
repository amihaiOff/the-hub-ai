'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { NetWorthBreakdown } from '@/lib/hooks/use-dashboard';

interface TotalWorthCardProps {
  breakdown: NetWorthBreakdown | undefined;
  netWorth: number | undefined;
  /** Formats an ILS value into the dashboard's selected display currency. */
  format: (value: number) => string;
  isLoading: boolean;
  error: unknown;
  /**
   * When true, skip the outer `<Card>` chrome and render the content flat.
   * Used when this card is already nested inside another container (e.g.
   * the collapsible net-worth block on the dashboard).
   */
  flat?: boolean;
}

/** One positive net-worth category (debts are handled separately). */
interface Segment {
  key: keyof NetWorthBreakdown;
  label: string;
  /** CSS var for the segment/legend colour. */
  color: string;
}

// Positive contributors, in display order. Savings/cash are folded into
// `portfolio` upstream, so there is no separate savings line.
const SEGMENTS: Segment[] = [
  { key: 'portfolio', label: 'Portfolio', color: 'var(--chart-1)' },
  { key: 'pension', label: 'Pension', color: 'var(--chart-2)' },
  { key: 'hishtalmut', label: 'Hishtalmut', color: 'var(--chart-3)' },
  { key: 'realEstate', label: 'Real estate', color: 'var(--chart-4)' },
  // Neutral, not chart-5 — that token equals --destructive and would clash with
  // the red Debts row. Other assets is a rare catch-all anyway.
  { key: 'otherAssets', label: 'Other assets', color: 'var(--muted-foreground)' },
];

export function TotalWorthCard({
  breakdown,
  netWorth,
  format,
  isLoading,
  error,
  flat,
}: TotalWorthCardProps) {
  const body = isLoading ? (
    <div className="space-y-4">
      <div className="bg-muted h-9 w-40 animate-pulse rounded" />
      <div className="bg-muted h-3 w-full animate-pulse rounded-full" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-6 w-full animate-pulse rounded" />
        ))}
      </div>
    </div>
  ) : error ? (
    <div className="text-destructive text-sm">Failed to load breakdown</div>
  ) : !breakdown ? (
    <div className="text-muted-foreground py-6 text-center text-sm">
      Add your accounts to see your total worth breakdown.
    </div>
  ) : (
    <Breakdown breakdown={breakdown} netWorth={netWorth ?? breakdown.netWorth} format={format} />
  );

  if (flat) {
    // Rendered inside another card (see the collapsible on the dashboard).
    // No outer chrome, no header — the parent already labels the section.
    return <div>{body}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Worth</CardTitle>
        <CardDescription>How your net worth breaks down by category</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function Breakdown({
  breakdown,
  netWorth,
  format,
}: {
  breakdown: NetWorthBreakdown;
  netWorth: number;
  format: (value: number) => string;
}) {
  // Only positive categories with a value make it into the bar/legend. The
  // bar is scaled to total gross assets (before debts) so segment widths read
  // as "share of what you own".
  const rows = SEGMENTS.map((s) => ({ ...s, value: breakdown[s.key] })).filter((r) => r.value > 0);
  const grossAssets = rows.reduce((sum, r) => sum + r.value, 0);
  const hasDebts = breakdown.debts > 0;

  if (grossAssets <= 0 && !hasDebts) {
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        Add your accounts to see your total worth breakdown.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Total net worth headline */}
      <div>
        <div className="text-3xl font-bold tabular-nums">{format(netWorth)}</div>
        <p className="text-muted-foreground text-xs">Total net worth</p>
      </div>

      {/* Stacked share-of-assets bar */}
      {grossAssets > 0 && (
        <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full" aria-hidden="true">
          {rows.map((r) => (
            <div
              key={r.key}
              style={{ width: `${(r.value / grossAssets) * 100}%`, backgroundColor: r.color }}
              className="h-full"
            />
          ))}
        </div>
      )}

      {/* Legend / itemized rows */}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground text-xs tabular-nums">
                {Math.round((r.value / grossAssets) * 100)}%
              </span>
              <span className="font-medium tabular-nums">{format(r.value)}</span>
            </span>
          </li>
        ))}

        {hasDebts && (
          <li className="border-border/60 flex items-center justify-between gap-3 border-t pt-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--destructive)' }}
              />
              <span className="truncate">Debts</span>
            </span>
            <span className="text-destructive font-medium tabular-nums">
              −{format(breakdown.debts)}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
