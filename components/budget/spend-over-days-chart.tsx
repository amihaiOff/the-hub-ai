'use client';

import { useMemo } from 'react';
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrencyILS } from '@/lib/utils/budget';

interface SpendOverDaysChartProps {
  dailySpent: { date: string; amount: number }[];
}

/** Fill gap days with 0 and add a running total. Dates are YYYY-MM-DD, ascending. */
export function buildDailySeries(dailySpent: { date: string; amount: number }[]) {
  if (dailySpent.length === 0) return [];
  const byDate = new Map(dailySpent.map((d) => [d.date, d.amount]));
  const series: { date: string; label: string; amount: number; cumulative: number }[] = [];
  const last = dailySpent[dailySpent.length - 1].date;
  let cumulative = 0;
  // UTC throughout so the day step never shifts across DST
  for (let d = new Date(`${dailySpent[0].date}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const amount = byDate.get(date) ?? 0;
    cumulative += amount;
    series.push({ date, label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, amount, cumulative });
    if (date >= last) break;
  }
  return series;
}

export function SpendOverDaysChart({ dailySpent }: SpendOverDaysChartProps) {
  const data = useMemo(() => buildDailySeries(dailySpent), [dailySpent]);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">No spending in this period</p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 5 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            minTickGap={12}
          />
          <YAxis
            yAxisId="daily"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            width={32}
          />
          <YAxis yAxisId="cumulative" orientation="right" hide />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data)[number];
              return (
                <div className="bg-background rounded-md border px-3 py-2 text-xs tabular-nums shadow-md">
                  <p className="text-muted-foreground mb-1 font-medium">{label}</p>
                  <p className="text-destructive">Day: {formatCurrencyILS(point.amount)}</p>
                  <p className="text-primary">Total: {formatCurrencyILS(point.cumulative)}</p>
                </div>
              );
            }}
          />
          <Bar yAxisId="daily" dataKey="amount" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="cumulative"
            dataKey="cumulative"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
