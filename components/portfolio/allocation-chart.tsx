'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AllocationItem } from '@/lib/utils/portfolio';

interface AllocationChartProps {
  allocation: AllocationItem[];
  isLoading?: boolean;
}

// Custom label renderer for the pie chart
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCustomLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
  if (!cx || !cy || !midAngle || !innerRadius || !outerRadius) return null;

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // Only show label if percentage > 5%
  if ((percent ?? 0) * 100 < 5) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={500}
    >
      {name}
    </text>
  );
}

export function AllocationChart({ allocation, isLoading }: AllocationChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
          <CardDescription>Distribution of your holdings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center">
            <div className="bg-muted h-48 w-48 animate-pulse rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (allocation.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
          <CardDescription>Distribution of your holdings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">Add holdings to see allocation breakdown</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for recharts
  const chartData = allocation.map((item) => ({
    name: item.symbol,
    value: item.value,
    percentage: item.percentage,
    color: item.color,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Allocation</CardTitle>
        <CardDescription>Distribution of your holdings by value</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={renderCustomLabel}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as {
                      name: string;
                      value: number;
                      percentage: number;
                    };
                    return (
                      <div className="bg-background rounded-lg border p-3 shadow-lg">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {formatCurrency(data.value)}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                formatter={(value: string) => (
                  <span className="text-sm" aria-label={`${value} allocation`}>
                    {value}
                  </span>
                )}
                iconType="circle"
                wrapperStyle={{ paddingTop: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
