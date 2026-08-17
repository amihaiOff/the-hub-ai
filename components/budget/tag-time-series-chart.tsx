'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList } from 'recharts';
import { formatCurrencyILS, type BudgetTransaction } from '@/lib/utils/budget';

/**
 * Monthly expense-bars for a single tag. Rendered inside the tag's
 * expanded section on /budget/tags, right under the transactions list —
 * gives an at-a-glance view of how that tag has been spent over time
 * without a separate analysis-page chart.
 *
 * Aggregates the incoming transactions by `YYYY-MM` (transactionDate) and
 * treats income transactions as negative so the sum matches how tag
 * totals are computed elsewhere in the app.
 */
export function TagTimeSeriesChart({
  transactions,
  color,
}: {
  transactions: BudgetTransaction[];
  color: string;
}) {
  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const t of transactions) {
      // transactionDate is an ISO string; slice to YYYY-MM. Handles both
      // full ISO ("2026-01-15T…") and plain date ("2026-01-15") forms.
      const key = String(t.transactionDate).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const amount = Number(t.amountIls);
      if (!Number.isFinite(amount)) continue;
      const signed = t.type === 'income' ? -amount : amount;
      byMonth.set(key, (byMonth.get(key) ?? 0) + signed);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([month, spent]) => ({ month, spent, label: formatMonth(month) }));
  }, [transactions]);

  if (chartData.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        Spending over time
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 14, right: 10, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#71717a' }}
              dy={4}
            />
            <YAxis
              axisLine={{ stroke: '#71717a', strokeOpacity: 0.35 }}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              width={40}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { label: string; spent: number };
                return (
                  <div className="bg-background rounded-md border px-3 py-2 shadow-md">
                    <p className="text-xs font-medium">{d.label}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatCurrencyILS(d.spent)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="spent" fill={color} radius={[2, 2, 0, 0]}>
              <LabelList
                dataKey="spent"
                position="top"
                formatter={(raw) => {
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return '';
                  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
                }}
                style={{ fill: '#a1a1aa', fontSize: 10 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
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
  return `${months[parseInt(m, 10) - 1] ?? m} ${y.slice(2)}`;
}
