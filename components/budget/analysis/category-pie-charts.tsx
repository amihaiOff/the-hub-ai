'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#EC4899',
  '#84CC16',
  '#6366F1',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCustomLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
  if (!cx || !cy || !midAngle || !innerRadius || !outerRadius) return null;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if ((percent ?? 0) * 100 < 5) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={500}
    >
      {name}
    </text>
  );
}

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

function DonutChart({ title, data }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground text-sm">No data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={renderCustomLabel}
                labelLine={false}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { name: string; value: number };
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div className="bg-background rounded-lg border p-2 shadow-lg">
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatCurrency(d.value, 'ILS')} ({pct}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface CategoryPieChartsProps {
  data: AnalysisData;
}

export function CategoryPieCharts({ data }: CategoryPieChartsProps) {
  // Group-level data
  const groupBudgeted = useMemo(
    () =>
      data.groups
        .filter((g) => g.totalBudgeted > 0)
        .map((g, i) => ({
          name: g.name,
          value: g.totalBudgeted,
          color: COLORS[i % COLORS.length],
        })),
    [data.groups]
  );

  const groupActual = useMemo(
    () =>
      data.groups
        .filter((g) => g.totalSpent > 0)
        .map((g, i) => ({ name: g.name, value: g.totalSpent, color: COLORS[i % COLORS.length] })),
    [data.groups]
  );

  // Category-level data (top 8 + Other)
  const { categoryBudgeted, categoryActual } = useMemo(() => {
    const allCats = data.groups.flatMap((g) => g.categories);

    const budgetedSorted = allCats
      .filter((c) => c.totalBudgeted > 0)
      .sort((a, b) => b.totalBudgeted - a.totalBudgeted);
    const actualSorted = allCats
      .filter((c) => c.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const topBudgeted = budgetedSorted.slice(0, 8);
    const otherBudgeted = budgetedSorted.slice(8).reduce((s, c) => s + c.totalBudgeted, 0);
    const catBudgeted = topBudgeted.map((c, i) => ({
      name: c.name,
      value: c.totalBudgeted,
      color: COLORS[i % COLORS.length],
    }));
    if (otherBudgeted > 0) {
      catBudgeted.push({ name: 'Other', value: otherBudgeted, color: '#94A3B8' });
    }

    const topActual = actualSorted.slice(0, 8);
    const otherActual = actualSorted.slice(8).reduce((s, c) => s + c.totalSpent, 0);
    const catActual = topActual.map((c, i) => ({
      name: c.name,
      value: c.totalSpent,
      color: COLORS[i % COLORS.length],
    }));
    if (otherActual > 0) {
      catActual.push({ name: 'Other', value: otherActual, color: '#94A3B8' });
    }

    return { categoryBudgeted: catBudgeted, categoryActual: catActual };
  }, [data.groups]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DonutChart title="Groups — Budgeted" data={groupBudgeted} />
        <DonutChart title="Groups — Actual" data={groupActual} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DonutChart title="Categories — Budgeted" data={categoryBudgeted} />
        <DonutChart title="Categories — Actual" data={categoryActual} />
      </div>
    </div>
  );
}
