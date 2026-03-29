'use client';

import { useId, useMemo, useRef, useState, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

export type SparklineTimespan = '1W' | '1M' | '6M' | '1Y' | 'ALL';

interface AccountSparklineProps {
  currentValue: number;
  totalGainLoss: number;
  timespan?: SparklineTimespan;
  formatValue?: (value: number) => string;
  /** Controls chart color: true = green/blue, false = red */
  isPositive?: boolean;
}

const TIMESPAN_CONFIG: Record<SparklineTimespan, { points: number; gainFraction: number }> = {
  '1W': { points: 7, gainFraction: 0.02 },
  '1M': { points: 15, gainFraction: 0.08 },
  '6M': { points: 26, gainFraction: 0.5 },
  '1Y': { points: 12, gainFraction: 1 },
  ALL: { points: 20, gainFraction: 1 },
};

function generateData(currentValue: number, totalGainLoss: number, timespan: SparklineTimespan) {
  const config = TIMESPAN_CONFIG[timespan];
  const costBasis = currentValue - totalGainLoss;
  const data = [];

  const gainRatio = costBasis > 0 ? totalGainLoss / costBasis : 0;
  const periodGain = gainRatio * config.gainFraction;

  const now = new Date();

  for (let i = 0; i < config.points; i++) {
    const progress = i / (config.points - 1);
    const startValue = currentValue / (1 + periodGain);
    const variance = Math.sin(i * 1.5) * 0.005 + Math.cos(i * 2.3) * 0.003;
    const value = startValue + (currentValue - startValue) * progress + startValue * variance;

    const date = new Date(now);
    const stepsBack = config.points - 1 - i;
    if (timespan === '1W') {
      date.setDate(date.getDate() - stepsBack);
    } else if (timespan === '1M') {
      date.setDate(date.getDate() - stepsBack * 2);
    } else if (timespan === '6M') {
      date.setDate(date.getDate() - stepsBack * 7);
    } else {
      date.setMonth(date.getMonth() - stepsBack);
    }

    data.push({
      value: Math.max(0, value),
      date: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(timespan === '1Y' || timespan === 'ALL' ? { year: '2-digit' } : {}),
      }),
    });
  }

  data[data.length - 1].value = currentValue;
  return data;
}

function SparklineTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number; payload: { date: string } }[];
  formatValue?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const { date } = payload[0].payload;
  const value = payload[0].value;
  return (
    <div className="border-border/50 bg-card/95 rounded-lg border px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="text-muted-foreground">{date}</p>
      <p className="font-semibold tabular-nums">
        {formatValue
          ? formatValue(value)
          : value.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
            })}
      </p>
    </div>
  );
}

export function AccountSparkline({
  currentValue,
  totalGainLoss,
  timespan = '1M',
  formatValue,
  isPositive = true,
}: AccountSparklineProps) {
  const id = useId();
  const data = useMemo(
    () => generateData(currentValue, totalGainLoss, timespan),
    [currentValue, totalGainLoss, timespan]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [touchActiveIndex, setTouchActiveIndex] = useState<number | undefined>(undefined);
  const isTouching = useRef(false);

  const resolveIndex = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el || data.length === 0) return undefined;
      const rect = el.getBoundingClientRect();
      const chartLeft = rect.left;
      const chartWidth = rect.width;
      const x = clientX - chartLeft;
      const ratio = Math.max(0, Math.min(1, x / chartWidth));
      return Math.round(ratio * (data.length - 1));
    },
    [data.length]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isTouching.current = true;
      const touch = e.touches[0];
      setTouchActiveIndex(resolveIndex(touch.clientX));
    },
    [resolveIndex]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isTouching.current) return;
      // Prevent vertical scroll while dragging on the chart
      e.preventDefault();
      const touch = e.touches[0];
      setTouchActiveIndex(resolveIndex(touch.clientX));
    },
    [resolveIndex]
  );

  const handleTouchEnd = useCallback(() => {
    isTouching.current = false;
    setTouchActiveIndex(undefined);
  }, []);

  if (currentValue === 0) return null;

  // Color based on performance direction
  const color = isPositive ? '#34d399' : '#f87171'; // emerald-400 for positive, red-400 for negative
  const gradientId = `sparkline-${id}`;

  return (
    <div
      ref={containerRef}
      className="h-full w-full touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      role="img"
      aria-label={`Sparkline chart for account performance, ${isPositive ? 'positive' : 'negative'} trend`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="70%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            active={touchActiveIndex !== undefined ? true : undefined}
            defaultIndex={touchActiveIndex}
            content={<SparklineTooltip formatValue={formatValue} />}
            cursor={{
              stroke: color,
              strokeWidth: 1,
              strokeDasharray: '4 4',
              strokeOpacity: 0.7,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{
              r: 4,
              fill: color,
              stroke: 'hsl(var(--card))',
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
