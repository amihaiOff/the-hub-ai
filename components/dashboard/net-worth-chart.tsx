'use client';

import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useNetWorthHistory, NetWorthDataPoint } from '@/lib/hooks/use-dashboard';
import { formatCurrency } from '@/lib/utils/portfolio';

type TimeRange = '3M' | '6M' | '1Y';

const TIME_RANGES: { label: string; value: TimeRange; points: number }[] = [
  { label: '3M', value: '3M', points: 6 },
  { label: '6M', value: '6M', points: 12 },
  { label: '1Y', value: '1Y', points: 24 },
];

interface ChartDataPoint {
  date: string;
  displayDate: string;
  netWorth: number;
  portfolio: number;
  pension: number;
  assets: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
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
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export function NetWorthChart() {
  const { data: history, isLoading, error } = useNetWorthHistory();
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    const rangeConfig = TIME_RANGES.find((r) => r.value === timeRange);
    const pointsToShow = rangeConfig?.points || 24;

    // Take the last N points based on time range
    const filteredData = history.slice(-pointsToShow);

    return filteredData.map(
      (point: NetWorthDataPoint): ChartDataPoint => ({
        date: point.date,
        displayDate: formatDate(point.date),
        netWorth: point.netWorth,
        portfolio: point.portfolio,
        pension: point.pension,
        assets: point.assets,
      })
    );
  }, [history, timeRange]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          <div className="bg-muted h-7 w-24 animate-pulse rounded" />
        </div>
        <div className="bg-muted h-64 w-full animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error || !history || history.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">Unable to load net worth history</p>
      </div>
    );
  }

  // Calculate change over the selected period
  const firstValue = chartData[0]?.netWorth || 0;
  const lastValue = chartData[chartData.length - 1]?.netWorth || 0;
  const change = lastValue - firstValue;
  const changePercent = firstValue > 0 ? (change / firstValue) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <div className="space-y-3">
      {/* Header with time range selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {timeRange === '3M' ? '3 Month' : timeRange === '6M' ? '6 Month' : '1 Year'} Change:
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-500' : 'text-red-500'}`}
          >
            {isPositive ? '+' : ''}
            {formatCurrency(change)} ({isPositive ? '+' : ''}
            {changePercent.toFixed(1)}%)
          </span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range selection">
          {TIME_RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              aria-pressed={timeRange === value}
              className={`rounded px-3 py-1.5 text-xs transition-colors ${
                timeRange === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pensionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="displayDate"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#71717a' }}
              dy={5}
              interval={isMobile ? 'preserveStartEnd' : Math.floor(chartData.length / 6)}
            />
            <YAxis
              hide={isMobile}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background rounded-md border px-3 py-2 shadow-md">
                      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
                      {payload.map((entry, index) => (
                        <p
                          key={index}
                          className="text-xs tabular-nums"
                          style={{ color: entry.color }}
                        >
                          {entry.name}: {formatCurrency(entry.value as number)}
                        </p>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px' }}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              name="Net Worth"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="portfolio"
              name="Stocks"
              stroke="#22c55e"
              strokeWidth={1.5}
              fill="url(#portfolioGradient)"
              dot={false}
              activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="pension"
              name="Pension"
              stroke="#f59e0b"
              strokeWidth={1.5}
              fill="url(#pensionGradient)"
              dot={false}
              activeDot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
