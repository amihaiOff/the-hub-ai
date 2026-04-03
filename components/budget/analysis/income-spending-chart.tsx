'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

type Mode = 'income' | 'spending' | 'net';

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

interface IncomeSpendingChartProps {
  data: AnalysisData;
}

export function IncomeSpendingChart({ data }: IncomeSpendingChartProps) {
  const [mode, setMode] = useState<Mode>('net');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const chartData = useMemo(
    () =>
      data.monthlyTotals.map((mt) => ({
        month: formatMonth(mt.month),
        income: mt.totalIncome,
        spending: mt.totalExpenses,
        net: mt.totalIncome - mt.totalExpenses,
      })),
    [data.monthlyTotals]
  );

  const dataKey = mode;
  const barColor = mode === 'income' ? '#10B981' : mode === 'spending' ? '#EF4444' : undefined;

  const modes: { value: Mode; label: string }[] = [
    { value: 'income', label: 'Income' },
    { value: 'spending', label: 'Spending' },
    { value: 'net', label: 'Net' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Income / Spending / Net</CardTitle>
          <div className="flex rounded-lg border p-0.5">
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
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
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) =>
                  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                width={50}
              />
              {mode === 'net' && <ReferenceLine y={0} stroke="#71717a" />}
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
              <Bar dataKey={dataKey} radius={[2, 2, 0, 0]} fill={barColor}>
                {mode === 'net' &&
                  chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.net >= 0 ? '#10B981' : '#EF4444'} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
