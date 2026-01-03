'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  LabelList,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/portfolio';

interface PortfolioGainsChartProps {
  currentValue: number;
  totalGainLoss: number;
  isLoading?: boolean;
}

type TimeRange = '6M' | '1Y' | '3Y' | '5Y' | 'YTD';

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: '3Y', value: '3Y' },
  { label: '5Y', value: '5Y' },
  { label: 'YTD', value: 'YTD' },
];

// Generate mock historical data based on current portfolio value and time range
// In production, this would come from a database snapshot table
function generateMockData(currentValue: number, totalGainLoss: number, timeRange: TimeRange) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let monthsBack: number;
  switch (timeRange) {
    case '6M':
      monthsBack = 6;
      break;
    case '1Y':
      monthsBack = 12;
      break;
    case '3Y':
      monthsBack = 36;
      break;
    case '5Y':
      monthsBack = 60;
      break;
    case 'YTD':
      monthsBack = currentMonth + 1;
      break;
  }

  const data = [];
  const costBasis = currentValue - totalGainLoss;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Determine point interval based on range
  const interval = timeRange === '5Y' ? 6 : timeRange === '3Y' ? 3 : 1;
  const numPoints = Math.ceil(monthsBack / interval);

  for (let i = 0; i < numPoints; i++) {
    const monthsFromStart = i * interval;
    const progress = monthsFromStart / (monthsBack - 1);

    // Add variance for realism
    const variance = (Math.sin(i * 1.2) * 0.03 + Math.cos(i * 0.8) * 0.02) * costBasis;
    const value = costBasis + (totalGainLoss * progress) + variance;

    // Calculate the actual month/year
    const targetMonth = (currentMonth - monthsBack + 1 + monthsFromStart + 12 * 10) % 12;
    const yearsBack = Math.floor((monthsBack - 1 - monthsFromStart) / 12);
    const year = currentYear - yearsBack;

    data.push({
      month: `${monthNames[targetMonth]} '${String(year).slice(-2)}`,
      value: Math.max(0, value),
      displayValue: formatCurrency(Math.max(0, value)),
    });
  }

  // Ensure last point is current value
  if (data.length > 0) {
    data[data.length - 1].value = currentValue;
    data[data.length - 1].displayValue = formatCurrency(currentValue);
  }

  return data;
}

export function PortfolioGainsChart({
  currentValue,
  totalGainLoss,
  isLoading,
}: PortfolioGainsChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const data = useMemo(
    () => generateMockData(currentValue, totalGainLoss, timeRange),
    [currentValue, totalGainLoss, timeRange]
  );

  const isPositive = totalGainLoss >= 0;
  const strokeColor = isPositive ? '#22c55e' : '#ef4444';
  const fillColor = isPositive ? '#22c55e' : '#ef4444';

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (currentValue === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Header with title and time range selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Portfolio Performance</h3>
        <div className="flex gap-1" role="group" aria-label="Time range selection">
          {TIME_RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value)}
              aria-pressed={timeRange === value}
              aria-label={`Show ${label === 'YTD' ? 'year to date' : label} time range`}
              className={`px-3 py-1.5 sm:px-2 sm:py-0.5 text-xs rounded transition-colors ${
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
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 20, right: 10, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="gainGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#71717a' }}
              dy={5}
              interval="preserveStartEnd"
            />
            <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const value = payload[0].value as number;
                  return (
                    <div className="rounded-md border bg-background px-2 py-1 shadow-sm">
                      <p className="text-xs font-medium tabular-nums">
                        {formatCurrency(value)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              fill="url(#gainGradient)"
              dot={{
                r: 4,
                fill: strokeColor,
                strokeWidth: 0,
              }}
              activeDot={{
                r: 5,
                fill: strokeColor,
                strokeWidth: 2,
                stroke: '#fff',
              }}
            >
              <LabelList
                dataKey="displayValue"
                position="top"
                offset={8}
                fontSize={9}
                fill="#71717a"
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
