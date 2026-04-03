'use client';

import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

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

interface CategoryTrendChartProps {
  data: AnalysisData;
}

export function CategoryTrendChart({ data }: CategoryTrendChartProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const allCategories = useMemo(
    () =>
      data.groups.flatMap((g) =>
        g.categories.map((c) => ({ ...c, groupName: g.name, groupId: g.id }))
      ),
    [data.groups]
  );

  const selectedCategory = useMemo(
    () => allCategories.find((c) => c.id === selectedCategoryId),
    [allCategories, selectedCategoryId]
  );

  const chartData = useMemo(
    () =>
      selectedCategory
        ? selectedCategory.monthlySpent.map((ms) => ({
            month: formatMonth(ms.month),
            spent: ms.spent,
          }))
        : [],
    [selectedCategory]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Category Spending Trend</CardTitle>
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {data.groups.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {group.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedCategory ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground text-sm">Select a category to view its trend</p>
          </div>
        ) : (
          <div className="h-64 w-full">
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
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#71717a' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  width={45}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-background rounded-md border px-3 py-2 shadow-md">
                        <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
                        <p className="text-sm font-medium tabular-nums">
                          {formatCurrency(Number(payload[0].value), 'ILS')}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="spent" fill="#3B82F6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
