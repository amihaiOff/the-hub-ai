'use client';

import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

const COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
  '#F97316', // orange-500
  '#EC4899', // pink-500
  '#84CC16', // lime-500
  '#6366F1', // indigo-500
];

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
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
  return `${months[parseInt(m, 10) - 1]} ${year.slice(2)}`;
}

interface OverallTrendChartProps {
  data: AnalysisData;
}

export function OverallTrendChart({ data }: OverallTrendChartProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only include groups that have spending
  const activeGroups = useMemo(
    () => data.groups.filter((g) => g.totalSpent > 0).sort((a, b) => b.totalSpent - a.totalSpent),
    [data.groups]
  );

  const chartData = useMemo(() => {
    return data.monthlyTotals.map((mt) => {
      const point: Record<string, string | number> = {
        month: formatMonth(mt.month),
      };
      for (const group of activeGroups) {
        const ms = group.monthlySpent.find((m) => m.month === mt.month);
        point[group.name] = ms?.spent ?? 0;
      }
      return point;
    });
  }, [data.monthlyTotals, activeGroups]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Monthly Spending by Group</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}
            >
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                dy={5}
              />
              <YAxis
                hide={isMobile}
                axisLine={{ stroke: '#71717a', strokeOpacity: 0.35 }}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  return (
                    <div className="bg-background rounded-md border px-3 py-2 shadow-md">
                      <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
                      {payload.map((entry, i) => (
                        <p key={i} className="text-xs tabular-nums" style={{ color: entry.color }}>
                          {entry.name}: {formatCurrency(Number(entry.value), 'ILS')}
                        </p>
                      ))}
                      <p className="mt-1 border-t pt-1 text-xs font-medium tabular-nums">
                        Total: {formatCurrency(total, 'ILS')}
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '10px' }}
              />
              {activeGroups.map((group, i) => (
                <Bar
                  key={group.id}
                  dataKey={group.name}
                  stackId="spending"
                  fill={COLORS[i % COLORS.length]}
                  radius={i === activeGroups.length - 1 ? [2, 2, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
