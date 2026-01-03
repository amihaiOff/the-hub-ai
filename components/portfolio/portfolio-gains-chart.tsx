'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/portfolio';

interface PortfolioGainsChartProps {
  currentValue: number;
  totalGainLoss: number;
  isLoading?: boolean;
}

// Generate mock historical data based on current portfolio value
// In production, this would come from a database snapshot table
function generateMockData(currentValue: number, totalGainLoss: number) {
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const data = [];

  // Start from cost basis (current value minus gain/loss)
  const costBasis = currentValue - totalGainLoss;

  // Generate a smooth progression from cost basis to current value
  for (let i = 0; i < months.length; i++) {
    const progress = i / (months.length - 1);
    // Add some variance to make it look realistic
    const variance = (Math.sin(i * 1.5) * 0.05) * costBasis;
    const value = costBasis + (totalGainLoss * progress) + variance;

    data.push({
      month: months[i],
      value: Math.max(0, value),
    });
  }

  return data;
}

export function PortfolioGainsChart({
  currentValue,
  totalGainLoss,
  isLoading,
}: PortfolioGainsChartProps) {
  const data = useMemo(
    () => generateMockData(currentValue, totalGainLoss),
    [currentValue, totalGainLoss]
  );

  const isPositive = totalGainLoss >= 0;
  const strokeColor = isPositive ? '#22c55e' : '#ef4444';
  const fillColor = isPositive ? '#22c55e' : '#ef4444';

  if (isLoading) {
    return (
      <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
    );
  }

  if (currentValue === 0) {
    return null;
  }

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
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
          />
          <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const value = payload[0].value as number;
                return (
                  <div className="rounded-md border bg-background px-2 py-1 shadow-sm">
                    <p className="text-xs font-medium">
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
              r: 3,
              fill: strokeColor,
              strokeWidth: 0,
            }}
            activeDot={{
              r: 4,
              fill: strokeColor,
              strokeWidth: 2,
              stroke: '#fff',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
