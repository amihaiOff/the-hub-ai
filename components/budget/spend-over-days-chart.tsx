'use client';

import { useMemo } from 'react';
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrencyILS } from '@/lib/utils/budget';

interface SpendOverDaysChartProps {
  dailySpent: { date: string; amount: number }[];
}

/** Local `YYYY-MM-DD` for today. */
function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Drop days from `today` on (today isn't over yet) and add a running total.
 * Input is the server's zero-filled, ascending per-day series for the cycle.
 */
export function buildDailySeries(
  dailySpent: { date: string; amount: number }[],
  today: string = localToday()
) {
  let cumulative = 0;
  return dailySpent
    .filter((d) => d.date < today)
    .map(({ date, amount }) => {
      cumulative += amount;
      const [, m, day] = date.split('-').map(Number);
      return { date, label: `${day}/${m}`, amount, cumulative };
    });
}

export function SpendOverDaysChart({ dailySpent }: SpendOverDaysChartProps) {
  const data = useMemo(() => buildDailySeries(dailySpent), [dailySpent]);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No completed days in this cycle yet
      </p>
    );
  }

  return (
    <div className="w-full">
      <p className="text-muted-foreground mb-2 text-xs">
        <span className="text-foreground font-semibold tabular-nums">
          {formatCurrencyILS(data[data.length - 1].cumulative)}
        </span>{' '}
        on credit card through {data[data.length - 1].label}
      </p>
      <ResponsiveContainer width="100%" height={288}>
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
