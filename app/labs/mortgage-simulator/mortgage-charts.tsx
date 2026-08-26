'use client';

import type { ReactElement } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

export interface YearlyDataEntry {
  year: number;
  basePayment: number;
  newPayment: number;
  baseCumInterest: number;
  newCumInterest: number;
  interestSaved: number;
  investmentValue: number;
  reinvestedSavings: number;
}

const fmt = (n: number): string => n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
const fmtK = (n: number): string => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(0) + 'K' : fmt(n));

type MortgageChartVariant = 'overview' | 'payments' | 'interest' | 'investment';

interface MortgageChartProps {
  variant: MortgageChartVariant;
  data: YearlyDataEntry[];
  /** Custom tooltip element cloned by Recharts with injected props. */
  tooltip: ReactElement;
  /** Reference line target for the investment comparison chart. */
  totalLumpCost?: number;
}

/**
 * Recharts body for the mortgage-simulator result panels. Extracted into
 * its own client component so it can be lazy-loaded (via `next/dynamic`),
 * keeping Recharts out of the page's initial bundle. The surrounding cards,
 * headings and descriptive copy stay in the page.
 */
export function MortgageChart({ variant, data, tooltip, totalLumpCost = 0 }: MortgageChartProps) {
  if (variant === 'overview') {
    return (
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="year"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            label={{
              value: 'Year',
              fill: '#6b7280',
              fontSize: 11,
              position: 'bottom',
            }}
          />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₪${fmtK(v)}`} />
          <Tooltip content={tooltip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="stepAfter"
            dataKey="basePayment"
            name="Base Payment"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="stepAfter"
            dataKey="newPayment"
            name="After Lump Sum"
            stroke="#a8caff"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (variant === 'payments') {
    return (
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₪${fmtK(v)}`} />
          <Tooltip content={tooltip} />
          <Area
            type="monotone"
            dataKey={(d: YearlyDataEntry) => d.basePayment - d.newPayment}
            name="Monthly Savings"
            fill="#8fddb033"
            stroke="#8fddb0"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (variant === 'interest') {
    return (
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₪${fmtK(v)}`} />
          <Tooltip content={tooltip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="baseCumInterest"
            name="Base Interest"
            fill="hsl(var(--muted-foreground) / 0.2)"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="newCumInterest"
            name="After Lump Sum"
            fill="#a8caff33"
            stroke="#a8caff"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="year"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          label={{
            value: 'Year',
            fill: '#6b7280',
            fontSize: 11,
            position: 'bottom',
          }}
        />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `₪${fmtK(v)}`} />
        <Tooltip content={tooltip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="investmentValue"
          name="A: Lump Sum Invested"
          stroke="#a8caff"
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="reinvestedSavings"
          name="B: Reinvested Rent Savings"
          stroke="#c9b8f7"
          strokeWidth={2.5}
          dot={false}
        />
        <ReferenceLine
          y={totalLumpCost}
          stroke="#f5a5a566"
          strokeDasharray="5 5"
          label={{
            value: `Lump ₪${fmtK(totalLumpCost)}`,
            fill: '#f5a5a5',
            fontSize: 10,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
