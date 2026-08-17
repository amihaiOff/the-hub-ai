'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

interface TagSpendingChartProps {
  data: AnalysisData;
}

export function TagSpendingChart({ data }: TagSpendingChartProps) {
  const chartData = useMemo(
    () =>
      data.tags
        .filter((t) => t.totalSpent > 0)
        .map((t) => ({
          name: t.name,
          spent: t.totalSpent,
          count: t.transactionCount,
          color: t.color,
        })),
    [data.tags]
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Spending by Tag</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground text-sm">No tagged transactions in this period</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartHeight = Math.max(200, chartData.length * 40 + 40);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Spending by Tag</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: chartHeight }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={{ stroke: '#71717a', strokeOpacity: 0.35 }}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#71717a' }}
                width={90}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as {
                    name: string;
                    spent: number;
                    count: number;
                  };
                  return (
                    <div className="bg-background rounded-md border px-3 py-2 shadow-md">
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {formatCurrency(d.spent, 'ILS')}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {d.count} transaction{d.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="spent" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="spent"
                  position="right"
                  formatter={(raw) => {
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return '';
                    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
                  }}
                  style={{ fill: '#a1a1aa', fontSize: 10 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
