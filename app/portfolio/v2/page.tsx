'use client';

import { useState, useMemo, useCallback, useId, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  TrendingUp,
  AlertCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePortfolio, useDeleteHolding } from '@/lib/hooks/use-portfolio';
import { CurrencyProvider, useCurrency } from '@/lib/contexts/currency-context';
import { calculateAllocation, getCurrencySymbol } from '@/lib/utils/portfolio';
import type { HoldingValue, AccountSummary } from '@/lib/utils/portfolio';
import { AccountSparkline } from '@/components/portfolio/account-sparkline';
import { OwnerBadges } from '@/components/shared/owner-badges';
import { EditHoldingDialog } from '@/components/portfolio/edit-holding-dialog';
import { DeleteConfirmDialog } from '@/components/portfolio/delete-confirm-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatHolding extends HoldingValue {
  accountName: string;
  accountId: string;
  accountCurrency: string;
}

type SortKey = 'symbol' | 'value' | 'gainLossPercent' | 'currentPrice' | 'quantity';
type SortDir = 'asc' | 'desc';
type TimeRange = '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOLDING_COLORS = [
  '#6ab2ff', // electric blue
  '#34d399', // emerald
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#f87171', // rose
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#86efac', // green-300
  '#fbbf24', // yellow
  '#60a5fa', // blue-400
  '#c084fc', // purple-400
];

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: '3Y', value: '3Y' },
  { label: '5Y', value: '5Y' },
  { label: 'ALL', value: 'ALL' },
];

// Currency flag/abbreviations for cash display
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  ILS: '🇮🇱',
  JPY: '🇯🇵',
  CHF: '🇨🇭',
};

// ─── Chart Data Generator ─────────────────────────────────────────────────────

function generateChartData(currentValue: number, totalGainLoss: number, timeRange: TimeRange) {
  const now = new Date();
  const costBasis = currentValue - totalGainLoss;

  const monthsMap: Record<TimeRange, number> = {
    '6M': 6,
    '1Y': 12,
    '3Y': 36,
    '5Y': 60,
    ALL: 60,
  };
  const monthsBack = monthsMap[timeRange];
  const interval = timeRange === '5Y' || timeRange === 'ALL' ? 6 : timeRange === '3Y' ? 3 : 1;
  const numPoints = Math.ceil(monthsBack / interval);
  const monthNames = [
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

  const data = [];
  for (let i = 0; i < numPoints; i++) {
    const progress = i / Math.max(numPoints - 1, 1);
    const variance = (Math.sin(i * 1.2) * 0.03 + Math.cos(i * 0.8) * 0.02) * costBasis;
    const value = Math.max(0, costBasis + totalGainLoss * progress + variance);

    const monthsFromStart = i * interval;
    const targetMonthIdx = (now.getMonth() - monthsBack + 1 + monthsFromStart + 12 * 10) % 12;
    const yearsBack = Math.floor((monthsBack - 1 - monthsFromStart) / 12);
    const year = now.getFullYear() - yearsBack;

    data.push({
      month: `${monthNames[targetMonthIdx]} '${String(year).slice(-2)}`,
      value,
    });
  }

  if (data.length > 0) {
    data[data.length - 1].value = currentValue;
  }

  return data;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtILS(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return `₪${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `₪${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtCurrency(value: number, currency: string, compact = false): string {
  const sym = getCurrencySymbol(currency);
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${sym}${(value / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `${sym}${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat(currency === 'ILS' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtQty(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="space-y-3 pt-2 pb-8">
      <div className="h-3 w-16 animate-pulse rounded bg-[#242629]" />
      <div className="h-12 w-72 animate-pulse rounded bg-[#242629]" />
      <div className="h-5 w-40 animate-pulse rounded bg-[#242629]" />
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-lg bg-[#242629] lg:h-80" />;
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-[#6ab2ff33]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#242629]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-[#242629]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[#242629]" />
          </div>
          <div className="h-4 w-20 animate-pulse rounded bg-[#242629]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[#242629]" />
        </div>
      ))}
    </div>
  );
}

// ─── Allocation Bar ───────────────────────────────────────────────────────────

interface AllocationBarProps {
  accounts: AccountSummary[];
}

function AllocationBar({ accounts }: AllocationBarProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const allocation = useMemo(() => calculateAllocation(accounts), [accounts]);

  if (allocation.length === 0) return null;

  // Reassign colors from our palette
  const segments = allocation.map((item, i) => ({
    ...item,
    color: HOLDING_COLORS[i % HOLDING_COLORS.length],
  }));

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="relative flex h-2 w-full overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.symbol}
            className="relative h-full cursor-pointer transition-all duration-200"
            style={{
              width: `${seg.percentage}%`,
              backgroundColor: seg.color,
              opacity: hovered && hovered !== seg.symbol ? 0.35 : 1,
            }}
            onMouseEnter={() => setHovered(seg.symbol)}
            onMouseLeave={() => setHovered(null)}
            role="presentation"
            aria-label={`${seg.symbol}: ${seg.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Tooltip — fixed height so it never shifts layout */}
      <div className="pointer-events-none h-6">
        {segments.map((seg) => (
          <div
            key={seg.symbol}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#6ab2ff33] bg-[#1a1b1e]/90 px-3 py-1 text-xs font-medium backdrop-blur-sm transition-opacity duration-150"
            style={{
              color: seg.color,
              opacity: hovered === seg.symbol ? 1 : 0,
              position: hovered === seg.symbol ? 'static' : 'absolute',
              pointerEvents: 'none',
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.symbol} · {seg.percentage.toFixed(1)}% · {fmtILS(seg.value, true)}
          </div>
        ))}
      </div>

      {/* Legend chips */}
      <div className="flex flex-wrap gap-2">
        {segments.map((seg) => (
          <div
            key={seg.symbol}
            className="flex cursor-default items-center gap-1.5 rounded-full border border-[#6ab2ff33] bg-[#1a1b1e] px-2.5 py-1 text-xs transition-all duration-200"
            style={{
              color: hovered === seg.symbol ? seg.color : 'rgba(253,251,254,0.6)',
              borderColor: hovered === seg.symbol ? seg.color + '80' : '#6ab2ff33',
            }}
            onMouseEnter={() => setHovered(seg.symbol)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.symbol}
            <span className="tabular-nums opacity-70">{seg.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Performance Chart ────────────────────────────────────────────────────────

interface PerformanceChartProps {
  currentValue: number;
  totalGainLoss: number;
}

function PerformanceChart({ currentValue, totalGainLoss }: PerformanceChartProps) {
  const gradientId = useId();
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');

  const data = useMemo(
    () => generateChartData(currentValue, totalGainLoss, timeRange),
    [currentValue, totalGainLoss, timeRange]
  );

  const isPositive = totalGainLoss >= 0;
  const strokeColor = '#6ab2ff';

  return (
    <div className="space-y-4">
      {/* Time range tabs */}
      <div className="flex items-center gap-1" role="group" aria-label="Chart time range">
        {TIME_RANGES.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setTimeRange(value)}
            aria-pressed={timeRange === value}
            aria-label={`Show ${label} time range`}
            className={[
              'min-h-[36px] min-w-[44px] rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
              'active:scale-[0.97]',
              timeRange === value
                ? 'bg-[#6ab2ff] text-[#0d0e10]'
                : 'text-[rgba(253,251,254,0.6)] hover:text-[#fdfbfe]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart — full bleed, no card */}
      <div className="h-64 w-full lg:h-80" aria-hidden="true">
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
                fill: 'rgba(253,251,254,0.4)',
                fontFamily: 'var(--font-manrope)',
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
                  <div className="rounded-xl border border-[#6ab2ff33] bg-[#1a1b1e]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
                    <p className="text-[rgba(253,251,254,0.5)]">{point.month}</p>
                    <p className="mt-0.5 font-semibold text-[#fdfbfe] tabular-nums">
                      {fmtILS(point.value)}
                    </p>
                  </div>
                );
              }}
              cursor={{
                stroke: '#6ab2ff',
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
                stroke: '#0d0e10',
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Sort Header (outside component to avoid render-time creation) ───────────

function SortHeader({
  label,
  sortable,
  align = 'left',
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortable?: SortKey;
  align?: 'left' | 'right';
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortable && sortKey === sortable;
  return (
    <th
      className={[
        'px-4 py-3 text-[10px] font-semibold tracking-widest uppercase',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[#6ab2ff]' : 'text-[rgba(253,251,254,0.4)]',
        sortable ? 'cursor-pointer select-none hover:text-[#fdfbfe]' : '',
      ].join(' ')}
      onClick={sortable ? () => onSort(sortable) : undefined}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <span
        className={['flex items-center gap-1', align === 'right' ? 'justify-end' : ''].join(' ')}
      >
        {label}
        {sortable && (
          <ArrowUpDown
            className={['h-3 w-3 transition-opacity', active ? 'opacity-100' : 'opacity-30'].join(
              ' '
            )}
            aria-hidden="true"
          />
        )}
      </span>
    </th>
  );
}

// ─── Holdings Table ───────────────────────────────────────────────────────────

interface HoldingsTableProps {
  holdings: FlatHolding[];
  colorMap: Record<string, string>;
  showInAlternate: boolean;
  nativeCurrency: string;
  alternateCurrency: string;
  rates?: Record<string, number>;
}

function HoldingsTable({
  holdings,
  colorMap,
  showInAlternate,
  nativeCurrency,
  alternateCurrency,
  rates,
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Dialog state
  const [editHolding, setEditHolding] = useState<FlatHolding | null>(null);
  const [deleteHolding, setDeleteHolding] = useState<FlatHolding | null>(null);
  const deleteMutation = useDeleteHolding();

  // Compute account total for progress bars (sum of all holdings in this table)
  const accountTotalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentValue, 0),
    [holdings]
  );

  // Convert a value to display currency
  const convertValue = useCallback(
    (value: number): number => {
      if (!showInAlternate || !rates) return value;
      const displayCurrency = alternateCurrency;
      if (displayCurrency === nativeCurrency) return value;
      // nativeCurrency → ILS → alternateCurrency
      // rates[X] = how many ILS per 1 X
      const nativeRate = rates[nativeCurrency] ?? 1;
      const altRate = rates[alternateCurrency];
      if (!altRate) return value;
      // value is in nativeCurrency
      // convert to ILS: value * nativeRate
      // convert ILS to alternateCurrency: / altRate
      if (alternateCurrency === 'ILS') {
        return value * nativeRate;
      }
      return (value * nativeRate) / altRate;
    },
    [showInAlternate, rates, nativeCurrency, alternateCurrency]
  );

  const displayCurrency = showInAlternate ? alternateCurrency : nativeCurrency;

  const fmtVal = useCallback(
    (value: number, compact = false): string => {
      return fmtCurrency(convertValue(value), displayCurrency, compact);
    },
    [convertValue, displayCurrency]
  );

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case 'symbol':
          av = a.symbol;
          bv = b.symbol;
          break;
        case 'value':
          av = a.currentValue;
          bv = b.currentValue;
          break;
        case 'gainLossPercent':
          av = a.gainLossPercent;
          bv = b.gainLossPercent;
          break;
        case 'currentPrice':
          av = a.currentPrice;
          bv = b.currentPrice;
          break;
        case 'quantity':
          av = a.quantity;
          bv = b.quantity;
          break;
      }
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [holdings, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sh = { sortKey, sortDir, onSort: handleSort };

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <TrendingUp className="h-10 w-10 text-[rgba(253,251,254,0.2)]" aria-hidden="true" />
        <p className="text-sm text-[rgba(253,251,254,0.4)]">No holdings yet</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      {/* Desktop table */}
      <table className="hidden w-full lg:table" aria-label="Holdings">
        <thead>
          <tr className="border-b border-[#6ab2ff33]">
            <th className="w-1 p-0" aria-hidden="true" />
            <SortHeader label="Asset" sortable="symbol" align="left" {...sh} />
            <SortHeader label="Qty" sortable="quantity" align="right" {...sh} />
            <SortHeader label="Avg Cost" align="right" {...sh} />
            <SortHeader label="Price" sortable="currentPrice" align="right" {...sh} />
            <SortHeader label="Value" sortable="value" align="right" {...sh} />
            <SortHeader label="P&L %" sortable="gainLossPercent" align="right" {...sh} />
            {/* Actions column — desktop only */}
            <th className="hidden w-8 lg:table-cell" aria-hidden="true" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#6ab2ff1a]">
          {sorted.map((h) => {
            const color = colorMap[h.symbol] ?? '#6ab2ff';
            const isGain = h.gainLoss >= 0;
            const gainColor = isGain ? '#34d399' : '#f87171';
            const gainIntensity = Math.min(Math.abs(h.gainLossPercent) / 50, 1);
            const accentColor = isGain
              ? `rgba(52, 211, 153, ${0.3 + gainIntensity * 0.7})`
              : `rgba(248, 113, 113, ${0.3 + gainIntensity * 0.7})`;
            const barPct = accountTotalValue > 0 ? (h.currentValue / accountTotalValue) * 100 : 0;

            return (
              <tr
                key={h.id}
                className="group relative transition-colors duration-150 hover:bg-[#242629]/50"
              >
                {/* Left accent bar */}
                <td className="w-1 p-0" aria-hidden="true">
                  <div
                    className="h-full w-1 rounded-r transition-opacity duration-150"
                    style={{ backgroundColor: accentColor }}
                  />
                </td>

                {/* Symbol */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: color + '22', color }}
                      aria-hidden="true"
                    >
                      {h.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold tracking-tight text-[#fdfbfe]">
                        {h.symbol}
                      </div>
                      {h.name && (
                        <div className="max-w-[160px] truncate text-[11px] text-[rgba(253,251,254,0.45)]">
                          {h.name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Qty */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[rgba(253,251,254,0.7)] tabular-nums">
                  {fmtQty(h.quantity)}
                </td>

                {/* Avg Cost */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[rgba(253,251,254,0.5)] tabular-nums">
                  {h.avgCostBasis.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                {/* Price */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[rgba(253,251,254,0.7)] tabular-nums">
                  {h.currentPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                {/* Value */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="text-sm font-semibold text-[#fdfbfe] tabular-nums">
                      {fmtVal(h.currentValue)}
                    </div>
                    {/* Mini value bar — % of account total */}
                    <div className="h-[3px] rounded-full bg-[#242629]" style={{ width: '80px' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                </td>

                {/* Gain% */}
                <td className="px-4 py-3.5 text-right">
                  <div
                    className="inline-flex flex-col items-end gap-0.5 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
                    style={{ color: gainColor, backgroundColor: gainColor + '15' }}
                  >
                    {fmtPct(h.gainLossPercent)}
                    <span className="text-[10px] font-normal opacity-70">
                      {isGain ? '+' : ''}
                      {fmtVal(h.gainLoss, true)}
                    </span>
                  </div>
                </td>

                {/* Actions — desktop only */}
                <td className="hidden px-2 py-3.5 text-right lg:table-cell">
                  <div className="opacity-30 transition-opacity duration-150 group-hover:opacity-100 hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label={`Actions for ${h.symbol}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[rgba(253,251,254,0.4)] transition-colors hover:bg-[#242629] hover:text-[#fdfbfe] active:scale-[0.95]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-[#6ab2ff33] bg-[#1a1b1e] text-[#fdfbfe]"
                      >
                        <DropdownMenuItem
                          onClick={() => setEditHolding(h)}
                          className="cursor-pointer gap-2 text-sm hover:bg-[#242629] focus:bg-[#242629]"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[rgba(253,251,254,0.5)]" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteHolding(h)}
                          className="cursor-pointer gap-2 text-sm text-[#f87171] hover:bg-[#f8717115] focus:bg-[#f8717115]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile list — tap to expand */}
      <div className="divide-y divide-[#6ab2ff1a] lg:hidden">
        {sorted.map((h) => {
          const color = colorMap[h.symbol] ?? '#6ab2ff';
          const isGain = h.gainLoss >= 0;
          const gainColor = isGain ? '#34d399' : '#f87171';
          const isExpanded = expandedRow === h.id;

          return (
            <div key={h.id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:scale-[0.99] active:bg-[#242629]/60"
                onClick={() => setExpandedRow(isExpanded ? null : h.id)}
                aria-expanded={isExpanded}
                aria-label={`${h.symbol} holding details`}
                style={{ minHeight: '56px' }}
              >
                {/* Color dot */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: color + '22', color }}
                  aria-hidden="true"
                >
                  {h.symbol.slice(0, 2)}
                </div>

                {/* Symbol */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold tracking-tight text-[#fdfbfe]">
                      {h.symbol}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[rgba(253,251,254,0.4)] tabular-nums">
                    {fmtQty(h.quantity)} shares
                  </div>
                </div>

                {/* Value + gain */}
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-[#fdfbfe] tabular-nums">
                    {fmtVal(h.currentValue)}
                  </div>
                  <div className="text-xs font-medium tabular-nums" style={{ color: gainColor }}>
                    {fmtPct(h.gainLossPercent)}
                  </div>
                </div>

                {/* Chevron */}
                <div
                  className="ml-1 shrink-0 transition-transform duration-200"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4 text-[rgba(253,251,254,0.3)]" />
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-[#6ab2ff1a] bg-[#1a1b1e]/50 px-4 py-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'Avg Cost', value: h.avgCostBasis.toFixed(2) },
                      { label: 'Current Price', value: h.currentPrice.toFixed(2) },
                      { label: 'Quantity', value: fmtQty(h.quantity) },
                      {
                        label: 'P&L',
                        value: fmtVal(h.gainLoss, true),
                        color: isGain ? '#34d399' : '#f87171',
                      },
                    ].map(({ label, value, color: c }) => (
                      <div key={label}>
                        <p className="text-[rgba(253,251,254,0.4)]">{label}</p>
                        <p
                          className="mt-0.5 font-semibold tabular-nums"
                          style={{ color: c ?? '#fdfbfe' }}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {/* Mobile Edit / Delete */}
                  <div className="mt-3 flex gap-2 border-t border-[#6ab2ff1a] pt-3">
                    <button
                      aria-label={`Edit ${h.symbol}`}
                      onClick={() => setEditHolding(h)}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#6ab2ff33] bg-[#242629] px-3 text-xs font-medium text-[rgba(253,251,254,0.7)] transition-colors hover:bg-[#2e3035] active:scale-[0.98]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      aria-label={`Delete ${h.symbol}`}
                      onClick={() => setDeleteHolding(h)}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#f8717133] bg-[#f8717108] px-3 text-xs font-medium text-[#f87171] transition-colors hover:bg-[#f8717120] active:scale-[0.98]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Dialog */}
      {editHolding && (
        <EditHoldingDialog
          holdingId={editHolding.id}
          holding={editHolding}
          open={editHolding !== null}
          onOpenChange={(open) => {
            if (!open) setEditHolding(null);
          }}
        />
      )}

      {/* Delete Dialog */}
      {deleteHolding && (
        <DeleteConfirmDialog
          title={`Delete ${deleteHolding.symbol}?`}
          description={`This will permanently remove ${deleteHolding.symbol} from your portfolio. This action cannot be undone.`}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(deleteHolding.id);
            setDeleteHolding(null);
          }}
          open={deleteHolding !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteHolding(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Per-Account Section ─────────────────────────────────────────────────────

interface AccountSectionProps {
  account: AccountSummary;
  colorMap: Record<string, string>;
  defaultOpen?: boolean;
  delay?: number;
}

function AccountSection({ account, colorMap, defaultOpen = true, delay = 0 }: AccountSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showInAlternate, setShowInAlternate] = useState(false);

  const { rates } = useCurrency();

  const isGain = account.totalGainLoss >= 0;
  const gainColor = isGain ? '#34d399' : '#f87171';

  // Determine alternate currency: if native is ILS show USD, else show ILS
  const nativeCurrency = account.currency;
  const alternateCurrency = nativeCurrency === 'ILS' ? 'USD' : 'ILS';
  const nativeSym = getCurrencySymbol(nativeCurrency);
  const altSym = getCurrencySymbol(alternateCurrency);

  const holdings: FlatHolding[] = account.holdings.map((h) => ({
    ...h,
    accountName: account.name,
    accountId: account.id,
    accountCurrency: account.currency,
  }));

  // Convert rates to plain Record<string, number>
  const ratesRecord = rates as Record<string, number> | undefined;

  return (
    <div
      className="mt-6"
      style={{ animation: `fadeUp 0.5s ${delay}s cubic-bezier(0.32,0.72,0,1) both` }}
    >
      {/* Account header row — acts as section divider */}
      <div className="flex w-full items-center justify-between border-t border-[#6ab2ff33] px-4 py-4 lg:px-8">
        {/* Left: collapse button + name + owner badges */}
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors duration-150 hover:opacity-80 active:scale-[0.995]"
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${account.name}`}
        >
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-[rgba(253,251,254,0.3)] transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#fdfbfe]">{account.name}</p>
            {account.broker && (
              <p className="text-[11px] text-[rgba(253,251,254,0.4)]">{account.broker}</p>
            )}
          </div>
          {account.owners && account.owners.length > 0 && (
            <OwnerBadges owners={account.owners} size="2xs" />
          )}
        </button>

        {/* Right: currency toggle + value + sparkline */}
        <div className="flex shrink-0 items-center gap-3">
          {/* Currency toggle */}
          <div
            className="flex items-center rounded-full border border-[#6ab2ff22] bg-[#1a1b1e] p-0.5"
            role="group"
            aria-label="Currency display toggle"
          >
            <button
              onClick={() => setShowInAlternate(false)}
              aria-pressed={!showInAlternate}
              aria-label={`Show in ${nativeCurrency}`}
              className={[
                'min-h-[28px] min-w-[28px] rounded-full px-2 text-[10px] font-bold transition-all duration-200 active:scale-[0.95]',
                !showInAlternate
                  ? 'bg-[#6ab2ff] text-[#0d0e10]'
                  : 'text-[rgba(253,251,254,0.4)] hover:text-[#fdfbfe]',
              ].join(' ')}
            >
              {nativeSym}
            </button>
            <button
              onClick={() => setShowInAlternate(true)}
              aria-pressed={showInAlternate}
              aria-label={`Show in ${alternateCurrency}`}
              className={[
                'min-h-[28px] min-w-[28px] rounded-full px-2 text-[10px] font-bold transition-all duration-200 active:scale-[0.95]',
                showInAlternate
                  ? 'bg-[#6ab2ff] text-[#0d0e10]'
                  : 'text-[rgba(253,251,254,0.4)] hover:text-[#fdfbfe]',
              ].join(' ')}
            >
              {altSym}
            </button>
          </div>

          {/* Value + gain% */}
          <div className="text-right">
            <p className="text-sm font-semibold text-[#fdfbfe] tabular-nums">
              {account.totalValue.toLocaleString(account.currency === 'ILS' ? 'he-IL' : 'en-US', {
                style: 'currency',
                currency: account.currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs font-medium tabular-nums" style={{ color: gainColor }}>
              {fmtPct(account.totalGainLossPercent)}
            </p>
          </div>
          {/* Mini sparkline */}
          {account.totalValue > 0 && (
            <div className="h-8 w-16 shrink-0 opacity-70">
              <AccountSparkline
                currentValue={account.totalValue}
                totalGainLoss={account.totalGainLoss}
                timespan="1M"
                isPositive={isGain}
              />
            </div>
          )}
        </div>
      </div>

      {/* Holdings table — collapses */}
      <div
        style={{
          display: isOpen ? 'block' : 'none',
        }}
      >
        <HoldingsTable
          holdings={holdings}
          colorMap={colorMap}
          showInAlternate={showInAlternate}
          nativeCurrency={nativeCurrency}
          alternateCurrency={alternateCurrency}
          rates={ratesRecord}
        />

        {/* Cash balances section */}
        {account.cashBalances && account.cashBalances.length > 0 && (
          <div className="mx-4 mt-2 mb-4 rounded-xl border border-[#6ab2ff1a] bg-[#1a1b1e]/50 lg:mx-8">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-bold tracking-[0.15em] text-[rgba(253,251,254,0.3)] uppercase">
                Cash
              </p>
            </div>
            <div className="divide-y divide-[#6ab2ff1a]">
              {account.cashBalances.map((cb) => {
                const flag = CURRENCY_FLAGS[cb.currency] ?? '';
                const sym = getCurrencySymbol(cb.currency);
                return (
                  <div key={cb.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none" aria-hidden="true">
                        {flag}
                      </span>
                      <span className="text-xs font-semibold text-[rgba(253,251,254,0.5)]">
                        {cb.currency}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm text-[rgba(253,251,254,0.6)] tabular-nums">
                        {sym}
                        {cb.amount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {cb.currency !== account.currency && (
                        <span className="ml-2 font-mono text-xs text-[rgba(253,251,254,0.35)] tabular-nums">
                          ({getCurrencySymbol(account.currency)}
                          {cb.convertedAmount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          )
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PortfolioV2Content() {
  const { data: portfolio, isLoading, error } = usePortfolio();

  const flatHoldings: FlatHolding[] = useMemo(() => {
    if (!portfolio?.accounts) return [];
    return portfolio.accounts.flatMap((a) =>
      a.holdings.map((h) => ({
        ...h,
        accountName: a.name,
        accountId: a.id,
        accountCurrency: a.currency,
      }))
    );
  }, [portfolio]);

  // Build symbol → color map
  const colorMap = useMemo(() => {
    const symbols = Array.from(new Set(flatHoldings.map((h) => h.symbol)));
    return Object.fromEntries(
      symbols.map((s, i) => [s, HOLDING_COLORS[i % HOLDING_COLORS.length]])
    );
  }, [flatHoldings]);

  const totalValue = portfolio?.totalValue ?? 0;
  const totalGainLoss = portfolio?.totalGainLoss ?? 0;
  const totalGainLossPercent = portfolio?.totalGainLossPercent ?? 0;
  const isPositive = totalGainLoss >= 0;
  const gainColor = isPositive ? '#34d399' : '#f87171';

  return (
    <div
      className="min-h-screen bg-[#0d0e10] pb-24"
      style={{ fontFamily: 'var(--font-manrope, system-ui, sans-serif)' }}
    >
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-8 pb-2 lg:px-8 lg:pt-12">
        {isLoading ? (
          <HeroSkeleton />
        ) : (
          <div
            className="space-y-2"
            style={{
              animation: 'fadeUp 0.5s cubic-bezier(0.32,0.72,0,1) both',
            }}
          >
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#6ab2ff33] bg-[#6ab2ff0d] px-2.5 py-0.5">
              <span className="text-[10px] font-bold tracking-[0.15em] text-[#6ab2ff] uppercase">
                Portfolio
              </span>
            </div>

            {/* Value */}
            <h1 className="text-5xl leading-none font-black tracking-tight text-[#fdfbfe] tabular-nums lg:text-7xl">
              {fmtILS(totalValue)}
            </h1>

            {/* Gain row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
                style={{ color: gainColor, backgroundColor: gainColor + '18' }}
              >
                {isPositive ? (
                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                )}
                {fmtILS(Math.abs(totalGainLoss))}
              </span>
              <span className="text-sm font-medium tabular-nums" style={{ color: gainColor }}>
                {fmtPct(totalGainLossPercent)} all time
              </span>
              <span className="text-xs text-[rgba(253,251,254,0.3)]">
                · {portfolio?.totalHoldings ?? 0} holdings
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── PERFORMANCE CHART ─────────────────────────────────────────────── */}
      <div className="mt-6 px-4 lg:px-8">
        {isLoading ? (
          <ChartSkeleton />
        ) : totalValue > 0 ? (
          <div style={{ animation: 'fadeUp 0.5s 0.1s cubic-bezier(0.32,0.72,0,1) both' }}>
            <PerformanceChart currentValue={totalValue} totalGainLoss={totalGainLoss} />
          </div>
        ) : null}
      </div>

      {/* ── ALLOCATION BAR ────────────────────────────────────────────────── */}
      {!isLoading && portfolio?.accounts && portfolio.accounts.length > 0 && (
        <div
          className="mt-8 px-4 lg:px-8"
          style={{ animation: 'fadeUp 0.5s 0.18s cubic-bezier(0.32,0.72,0,1) both' }}
        >
          <p className="mb-3 text-[10px] font-bold tracking-[0.15em] text-[rgba(253,251,254,0.4)] uppercase">
            Allocation
          </p>
          <AllocationBar accounts={portfolio.accounts} />
        </div>
      )}

      {/* ── PER-ACCOUNT HOLDINGS ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="mt-8">
          <TableSkeleton />
        </div>
      ) : (
        portfolio?.accounts?.map((account, i) => (
          <AccountSection
            key={account.id}
            account={account}
            colorMap={colorMap}
            defaultOpen={true}
            delay={0.24 + i * 0.06}
          />
        ))
      )}

      {/* ── ERROR STATE ───────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-6 flex items-start gap-3 rounded-xl border border-[#f8717133] bg-[#f8717108] p-4 lg:mx-8">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#f87171]">Failed to load portfolio</p>
            <p className="mt-0.5 text-xs text-[rgba(253,251,254,0.5)]">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function PortfolioV2Page() {
  return (
    <CurrencyProvider>
      <PortfolioV2Content />
    </CurrencyProvider>
  );
}
