'use client';

import { useId, useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

interface AccountSparklineProps {
  currentValue: number;
  totalGainLoss: number;
}

function generateLastMonthData(currentValue: number, totalGainLoss: number) {
  const costBasis = currentValue - totalGainLoss;
  const points = 15;
  const data = [];

  // Simulate ~1 month of daily-ish data points ending at current value
  // Use the gain/loss ratio to create a realistic trend
  const gainRatio = costBasis > 0 ? totalGainLoss / costBasis : 0;
  // Only show roughly last month's portion of gain
  const monthGain = gainRatio * 0.08; // ~1 month out of a year

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const startValue = currentValue / (1 + monthGain);
    const variance = Math.sin(i * 1.5) * 0.005 + Math.cos(i * 2.3) * 0.003;
    const value = startValue + (currentValue - startValue) * progress + startValue * variance;
    data.push({ value: Math.max(0, value) });
  }

  // Ensure last point is exact current value
  data[data.length - 1].value = currentValue;

  return data;
}

export function AccountSparkline({ currentValue, totalGainLoss }: AccountSparklineProps) {
  const id = useId();
  const data = useMemo(
    () => generateLastMonthData(currentValue, totalGainLoss),
    [currentValue, totalGainLoss]
  );

  if (currentValue === 0) return null;

  const isPositive = totalGainLoss >= 0;
  const color = isPositive ? '#22c55e' : '#ef4444';
  const gradientId = `sparkline-${id}`;

  return (
    <div className="h-10 w-24 sm:w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
