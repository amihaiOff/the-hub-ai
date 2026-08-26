'use client';

import { useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface PerformanceAreaChartProps {
  data: { month: string; value: number }[];
  isPositive: boolean;
  /** Formats a numeric value for the tooltip (e.g. ILS currency). */
  formatValue: (value: number) => string;
}

/**
 * Recharts area chart for the portfolio performance panel. Extracted into
 * its own client component so it can be lazy-loaded (via `next/dynamic`),
 * keeping Recharts out of the portfolio page's initial bundle.
 */
export function PerformanceAreaChart({ data, isPositive, formatValue }: PerformanceAreaChartProps) {
  const gradientId = useId();
  const strokeColor = '#a8caff';

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={isPositive ? 0.25 : 0.12} />
            <stop offset="75%" stopColor={strokeColor} stopOpacity={0.04} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 10,
            fill: '#a0aec0',
            fontFamily: 'var(--font-lexend)',
          }}
          dy={8}
          interval="preserveStartEnd"
        />
        <YAxis hide domain={['dataMin - 50000', 'dataMax + 50000']} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as { month: string; value: number };
            return (
              <div className="rounded-xl border border-[#424a59] bg-[#373e4c]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
                <p className="text-[#a0aec0]">{point.month}</p>
                <p className="mt-0.5 font-semibold text-[#ffffff] tabular-nums">
                  {formatValue(point.value)}
                </p>
              </div>
            );
          }}
          cursor={{
            stroke: '#a8caff',
            strokeWidth: 1,
            strokeDasharray: '4 4',
            strokeOpacity: 0.5,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: strokeColor,
            stroke: '#2a2f3a',
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
