'use client';

import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

interface TagSpendingOverviewChartProps {
  data: AnalysisData;
}

export function TagSpendingOverviewChart({ data }: TagSpendingOverviewChartProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const chartData = useMemo(
    () =>
      data.tags
        .filter((t) => t.totalSpent > 0)
        .sort((a, b) => b.totalSpent - a.totalSpent)
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
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground text-sm">No tagged transactions in this period</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Spending by Tag</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}
            >
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                dy={5}
                interval={0}
                angle={chartData.length > 6 ? -45 : 0}
                textAnchor={chartData.length > 6 ? 'end' : 'middle'}
                height={chartData.length > 6 ? 60 : 30}
              />
              <YAxis
                hide={isMobile}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                width={45}
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
              <Bar dataKey="spent" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
