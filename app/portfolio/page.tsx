'use client';

import { useState, useMemo, useCallback, useId } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  usePortfolio,
  useDeleteHolding,
  useDeleteAccount,
  usePortfolioAccountHistory,
} from '@/lib/hooks/use-portfolio';
import {
  useMoneytorPortfolio,
  useMoneytorPortfolioHistory,
  useDeleteMoneytorAccount,
} from '@/lib/hooks/use-moneytor';
import { CurrencyProvider, useCurrency } from '@/lib/contexts/currency-context';
import { calculateAllocation, getCurrencySymbol } from '@/lib/utils/portfolio';
import type { AccountSummary, HoldingValue } from '@/lib/utils/portfolio';
import { AccountSparkline } from '@/components/portfolio/account-sparkline';
import { OwnerBadges } from '@/components/shared/owner-badges';
import { EditHoldingDialog } from '@/components/portfolio/edit-holding-dialog';
import { DeleteConfirmDialog } from '@/components/portfolio/delete-confirm-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountSource = 'legacy' | 'moneytor';

interface CombinedAccount extends AccountSummary {
  source: AccountSource;
}

interface FlatHolding extends HoldingValue {
  accountName: string;
  accountId: string;
  accountCurrency: string;
  accountSource: AccountSource;
}

type SortKey = 'symbol' | 'value' | 'gainLossPercent' | 'currentPrice' | 'quantity';
type SortDir = 'asc' | 'desc';
type TimeRange = '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOLDING_COLORS = [
  '#a8caff', // electric blue
  '#34d399', // emerald
  '#f5cd85', // amber
  '#c9b8f7', // violet
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

// ─── Chart helpers ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
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

function formatPointLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()} '${String(d.getUTCFullYear()).slice(-2)}`;
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
      <div className="h-3 w-16 animate-pulse rounded bg-[#2d3748]" />
      <div className="h-12 w-72 animate-pulse rounded bg-[#2d3748]" />
      <div className="h-5 w-40 animate-pulse rounded bg-[#2d3748]" />
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-lg bg-[#2d3748] lg:h-80" />;
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-[#2d3748]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="h-8 w-8 animate-pulse rounded-full bg-[#2d3748]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-[#2d3748]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[#2d3748]" />
          </div>
          <div className="h-4 w-20 animate-pulse rounded bg-[#2d3748]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[#2d3748]" />
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
            className="inline-flex items-center gap-1.5 rounded-full border border-[#2d3748] bg-[#1e2125]/90 px-3 py-1 text-xs font-medium backdrop-blur-sm transition-opacity duration-150"
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
            className="flex cursor-default items-center gap-1.5 rounded-full border border-[#2d3748] bg-[#1e2125] px-2.5 py-1 text-xs transition-all duration-200"
            style={{
              color: hovered === seg.symbol ? seg.color : '#a0aec0',
              borderColor: hovered === seg.symbol ? seg.color + '80' : '#2d3748',
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
  totalGainLoss: number;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  points: { date: string; value: number }[];
  isLoading: boolean;
}

function PerformanceChart({
  totalGainLoss,
  timeRange,
  onTimeRangeChange,
  points,
  isLoading: historyLoading,
}: PerformanceChartProps) {
  const gradientId = useId();

  const data = useMemo(
    () =>
      points.map((p) => ({
        month: formatPointLabel(p.date),
        value: p.value,
      })),
    [points]
  );

  const isPositive = totalGainLoss >= 0;
  const strokeColor = '#a8caff';

  return (
    <div className="space-y-4">
      {/* Time range tabs */}
      <div className="flex items-center gap-1" role="group" aria-label="Chart time range">
        {TIME_RANGES.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onTimeRangeChange(value)}
            aria-pressed={timeRange === value}
            aria-label={`Show ${label} time range`}
            className={[
              'min-h-[36px] min-w-[44px] rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
              'active:scale-[0.97]',
              timeRange === value
                ? 'bg-[#a8caff] text-[#121417]'
                : 'text-[#a0aec0] hover:text-[#ffffff]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart — full bleed, no card */}
      <div className="h-64 w-full lg:h-80" aria-hidden="true">
        {historyLoading ? (
          <ChartSkeleton />
        ) : data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-[#a0aec0]">
            Not enough history yet — sync daily to build the chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={strokeColor}
                    stopOpacity={isPositive ? 0.25 : 0.12}
                  />
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
                    <div className="rounded-xl border border-[#2d3748] bg-[#1e2125]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
                      <p className="text-[#a0aec0]">{point.month}</p>
                      <p className="mt-0.5 font-semibold text-[#ffffff] tabular-nums">
                        {fmtILS(point.value)}
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
                  stroke: '#121417',
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
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
        active ? 'text-[#a8caff]' : 'text-[#a0aec0]',
        sortable ? 'cursor-pointer select-none hover:text-[#ffffff]' : '',
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
  /** Source of the account. Edit/delete only shown for hand-managed (legacy) rows. */
  source: AccountSource;
}

function HoldingsTable({
  holdings,
  colorMap,
  showInAlternate,
  nativeCurrency,
  alternateCurrency,
  rates,
  source,
}: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editHolding, setEditHolding] = useState<FlatHolding | null>(null);
  const [deleteHolding, setDeleteHolding] = useState<FlatHolding | null>(null);
  const deleteMutation = useDeleteHolding();
  const canEdit = source === 'legacy';

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
        <TrendingUp className="h-10 w-10 text-[#a0aec0]" aria-hidden="true" />
        <p className="text-sm text-[#a0aec0]">No holdings yet</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      {/* Desktop table */}
      <table className="hidden w-full lg:table" aria-label="Holdings">
        <thead>
          <tr className="border-b border-[#2d3748]">
            <th className="w-1 p-0" aria-hidden="true" />
            <SortHeader label="Asset" sortable="symbol" align="left" {...sh} />
            <SortHeader label="Qty" sortable="quantity" align="right" {...sh} />
            <SortHeader label="Avg Cost" align="right" {...sh} />
            <SortHeader label="Price" sortable="currentPrice" align="right" {...sh} />
            <SortHeader label="Value" sortable="value" align="right" {...sh} />
            <SortHeader label="P&L %" sortable="gainLossPercent" align="right" {...sh} />
            {canEdit && <th className="hidden w-8 lg:table-cell" aria-hidden="true" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2d3748]">
          {sorted.map((h) => {
            const color = colorMap[h.symbol] ?? '#a8caff';
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
                className="group relative transition-colors duration-150 hover:bg-[#2d3748]/50"
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
                      <div className="text-sm font-semibold tracking-tight text-[#ffffff]">
                        {h.symbol}
                      </div>
                      {h.name && (
                        <div className="max-w-[160px] truncate text-[11px] text-[#a0aec0]">
                          {h.name}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Qty */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[#a0aec0] tabular-nums">
                  {fmtQty(h.quantity)}
                </td>

                {/* Avg Cost */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[#a0aec0] tabular-nums">
                  {h.avgCostBasis.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                {/* Price */}
                <td className="px-4 py-3.5 text-right font-mono text-sm text-[#a0aec0] tabular-nums">
                  {h.currentPrice.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>

                {/* Value */}
                <td className="px-4 py-3.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="text-sm font-semibold text-[#ffffff] tabular-nums">
                      {fmtVal(h.currentValue)}
                    </div>
                    {/* Mini value bar — % of account total */}
                    <div className="h-[3px] rounded-full bg-[#2d3748]" style={{ width: '80px' }}>
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

                {/* Actions — desktop only, legacy accounts only */}
                {canEdit && (
                  <td className="hidden px-2 py-3.5 text-right lg:table-cell">
                    <div className="opacity-30 transition-opacity duration-150 group-hover:opacity-100 hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label={`Actions for ${h.symbol}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[#a0aec0] transition-colors hover:bg-[#2d3748] hover:text-[#ffffff] active:scale-[0.95]"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="border-[#2d3748] bg-[#1e2125] text-[#ffffff]"
                        >
                          <DropdownMenuItem
                            onClick={() => setEditHolding(h)}
                            className="cursor-pointer gap-2 text-sm hover:bg-[#2d3748] focus:bg-[#2d3748]"
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#a0aec0]" />
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
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile list — tap to expand */}
      <div className="divide-y divide-[#2d3748] lg:hidden">
        {sorted.map((h) => {
          const color = colorMap[h.symbol] ?? '#a8caff';
          const isGain = h.gainLoss >= 0;
          const gainColor = isGain ? '#34d399' : '#f87171';
          const isExpanded = expandedRow === h.id;

          return (
            <div key={h.id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:scale-[0.99] active:bg-[#2d3748]/60"
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
                    <span className="text-sm font-semibold tracking-tight text-[#ffffff]">
                      {h.symbol}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#a0aec0] tabular-nums">
                    {fmtQty(h.quantity)} shares
                  </div>
                </div>

                {/* Value + gain */}
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-[#ffffff] tabular-nums">
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
                  <ChevronDown className="h-4 w-4 text-[#a0aec0]" />
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-[#2d3748] bg-[#1e2125]/50 px-4 py-3">
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
                        <p className="text-[#a0aec0]">{label}</p>
                        <p
                          className="mt-0.5 font-semibold tabular-nums"
                          style={{ color: c ?? '#ffffff' }}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="mt-3 flex gap-2 border-t border-[#2d3748] pt-3">
                      <button
                        aria-label={`Edit ${h.symbol}`}
                        onClick={() => setEditHolding(h)}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#3d4a5c] bg-[#2d3748] px-3 text-xs font-medium text-[#a0aec0] transition-colors hover:bg-[#374151] active:scale-[0.98]"
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit / Delete dialogs (legacy accounts only) */}
      {canEdit && editHolding && (
        <EditHoldingDialog
          holdingId={editHolding.id}
          holding={editHolding}
          open={editHolding !== null}
          onOpenChange={(open) => {
            if (!open) setEditHolding(null);
          }}
        />
      )}
      {canEdit && deleteHolding && (
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
  account: CombinedAccount;
  colorMap: Record<string, string>;
  defaultOpen?: boolean;
  delay?: number;
  sparklinePoints?: { date: string; value: number }[];
}

function AccountSection({
  account,
  colorMap,
  defaultOpen = true,
  delay = 0,
  sparklinePoints,
}: AccountSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showInAlternate, setShowInAlternate] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const deleteLegacyAccount = useDeleteAccount();
  const deleteMoneytorAccount = useDeleteMoneytorAccount();
  const isMoneytor = account.source === 'moneytor';
  const deleteMutation = isMoneytor ? deleteMoneytorAccount : deleteLegacyAccount;

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
    accountSource: account.source,
  }));

  // Convert rates to plain Record<string, number>
  const ratesRecord = rates as Record<string, number> | undefined;

  return (
    <div
      className="mt-6"
      style={{ animation: `fadeUp 0.5s ${delay}s cubic-bezier(0.32,0.72,0,1) both` }}
    >
      {/* Account header row — 3-column grid: left (name) | middle (sparkline) | right (value + actions).
          Sparkline is centered in the title bar at ~25% width. */}
      <div
        className="grid w-full items-center gap-4 border-t border-[#2d3748] px-4 py-4 lg:px-8"
        style={{ gridTemplateColumns: '1fr 25% 1fr' }}
      >
        {/* Left: collapse button + name + owner badges */}
        <button
          className="flex min-w-0 items-center gap-3 text-left transition-colors duration-150 hover:opacity-80 active:scale-[0.995]"
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${account.name}`}
        >
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-[#a0aec0] transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#ffffff]">{account.name}</p>
              {account.source === 'moneytor' && (
                <span className="rounded-full border border-[#2d3748] bg-[#a8caff0d] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[#a8caff] uppercase">
                  Moneytor
                </span>
              )}
            </div>
            {account.broker && <p className="text-[11px] text-[#a0aec0]">{account.broker}</p>}
          </div>
          {account.owners && account.owners.length > 0 && (
            <OwnerBadges owners={account.owners} size="2xs" />
          )}
        </button>

        {/* Middle: sparkline — centered, ~25% of title bar width.
            Hidden on small screens to keep the title legible. */}
        <div className="hidden h-10 md:block">
          {account.totalValue > 0 && sparklinePoints && sparklinePoints.length >= 2 ? (
            <div className="h-full w-full opacity-80">
              <AccountSparkline
                currentValue={account.totalValue}
                totalGainLoss={account.totalGainLoss}
                isPositive={isGain}
                points={sparklinePoints}
              />
            </div>
          ) : null}
        </div>

        {/* Right: value + actions (currency toggle lives inside the actions menu) */}
        <div className="flex items-center justify-end gap-3">
          {/* Value + gain% */}
          <div className="text-right">
            <p className="text-sm font-semibold text-[#ffffff] tabular-nums">
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
          {/* Account actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Actions for ${account.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#a0aec0] transition-colors hover:bg-[#2d3748] hover:text-[#ffffff] active:scale-[0.95]"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-[#2d3748] bg-[#1e2125] text-[#ffffff]"
            >
              <DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-[#a0aec0] uppercase">
                Display currency
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={showInAlternate ? alternateCurrency : nativeCurrency}
                onValueChange={(v) => setShowInAlternate(v === alternateCurrency)}
              >
                <DropdownMenuRadioItem
                  value={nativeCurrency}
                  className="cursor-pointer text-sm hover:bg-[#2d3748] focus:bg-[#2d3748]"
                >
                  {nativeSym} {nativeCurrency}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value={alternateCurrency}
                  className="cursor-pointer text-sm hover:bg-[#2d3748] focus:bg-[#2d3748]"
                >
                  {altSym} {alternateCurrency}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="bg-[#2d3748]" />
              <DropdownMenuItem
                onClick={() => setConfirmDeleteAccount(true)}
                className="cursor-pointer gap-2 text-sm text-[#f87171] hover:bg-[#f8717115] focus:bg-[#f8717115]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete account confirmation. Legacy accounts are permanently removed; Moneytor
          accounts are only removed from the local mirror — they'll re-appear on next sync. */}
      {confirmDeleteAccount && (
        <DeleteConfirmDialog
          title={`Delete ${account.name}?`}
          description={
            isMoneytor
              ? `This removes the local mirror of "${account.name}" (${account.holdings.length} holdings) along with its sync history. The account will re-appear on the next Moneytor sync unless you remove it from Moneytor first.`
              : `This will permanently remove the "${account.name}" account along with all ${account.holdings.length} holdings and cash balances. This action cannot be undone.`
          }
          onConfirm={async () => {
            await deleteMutation.mutateAsync(account.id);
            setConfirmDeleteAccount(false);
          }}
          open={confirmDeleteAccount}
          onOpenChange={setConfirmDeleteAccount}
        />
      )}

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
          source={account.source}
        />

        {/* Cash balances section */}
        {account.cashBalances && account.cashBalances.length > 0 && (
          <div className="mx-4 mt-2 mb-4 rounded-xl border border-[#2d3748] bg-[#1e2125]/50 lg:mx-8">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-bold tracking-[0.15em] text-[#a0aec0] uppercase">
                Cash
              </p>
            </div>
            <div className="divide-y divide-[#2d3748]">
              {account.cashBalances.map((cb) => {
                const flag = CURRENCY_FLAGS[cb.currency] ?? '';
                const sym = getCurrencySymbol(cb.currency);
                return (
                  <div key={cb.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none" aria-hidden="true">
                        {flag}
                      </span>
                      <span className="text-xs font-semibold text-[#a0aec0]">{cb.currency}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm text-[#a0aec0] tabular-nums">
                        {sym}
                        {cb.amount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {cb.currency !== account.currency && (
                        <span className="ml-2 font-mono text-xs text-[#a0aec0] tabular-nums">
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
  // Two independent sources: hand-managed (legacy) accounts and Moneytor-synced accounts.
  // They're merged into one list here so the v2 page shows everything in one view.
  const { data: legacy, isLoading: legacyLoading, error: legacyError } = usePortfolio();
  const { data: moneytor, isLoading: moneytorLoading } = useMoneytorPortfolio();
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const { data: history, isLoading: historyLoading } = useMoneytorPortfolioHistory(timeRange);
  const { data: legacyHistory } = usePortfolioAccountHistory(timeRange);

  const isLoading = legacyLoading || moneytorLoading;
  // Surface the legacy load error since it's the bigger surface; Moneytor errors are
  // handled inline beside the Sync button.
  const error = legacyError;

  // Map account id → real per-account series. Moneytor accounts use snapshot history;
  // legacy accounts use stock_price_history × current holdings (computed server-side).
  const accountPoints = useMemo(() => {
    const map: Record<string, { date: string; value: number }[]> = {};
    for (const a of history?.accounts ?? []) {
      map[a.productId] = a.points;
    }
    for (const a of legacyHistory?.accounts ?? []) {
      map[a.accountId] = a.points;
    }
    return map;
  }, [history, legacyHistory]);

  // Combine accounts from both sources, marking the source so the UI can render
  // edit/delete buttons only on hand-managed (legacy) accounts.
  const accounts: CombinedAccount[] = useMemo(() => {
    const list: CombinedAccount[] = [];
    for (const a of legacy?.accounts ?? []) {
      list.push({ ...a, source: 'legacy' });
    }
    for (const a of moneytor?.accounts ?? []) {
      list.push({ ...a, source: 'moneytor' });
    }
    return list.sort((a, b) => b.totalValue - a.totalValue);
  }, [legacy, moneytor]);

  const flatHoldings: FlatHolding[] = useMemo(() => {
    return accounts.flatMap((a) =>
      a.holdings.map((h) => ({
        ...h,
        accountName: a.name,
        accountId: a.id,
        accountCurrency: a.currency,
        accountSource: a.source,
      }))
    );
  }, [accounts]);

  // Build symbol → color map
  const colorMap = useMemo(() => {
    const symbols = Array.from(new Set(flatHoldings.map((h) => h.symbol)));
    return Object.fromEntries(
      symbols.map((s, i) => [s, HOLDING_COLORS[i % HOLDING_COLORS.length]])
    );
  }, [flatHoldings]);

  // Combined totals across both sources. Per-account totalValue is in the account's
  // native currency, so naive summing across e.g. USD + ILS would be wrong. Use each
  // API's pre-aggregated ILS totals at the top level instead.
  const totalValue = (legacy?.totalValue ?? 0) + (moneytor?.totalValue ?? 0);
  const totalCostBasis = (legacy?.totalCostBasis ?? 0) + (moneytor?.totalCostBasis ?? 0);
  const totalGainLoss = (legacy?.totalGainLoss ?? 0) + (moneytor?.totalGainLoss ?? 0);
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const totalHoldings = accounts.reduce((s, a) => s + a.holdings.length, 0);
  const isPositive = totalGainLoss >= 0;
  const gainColor = isPositive ? '#34d399' : '#f87171';

  return (
    <div
      className="min-h-screen bg-[#121417] pb-24"
      style={{ fontFamily: 'var(--font-lexend, system-ui, sans-serif)' }}
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
            {/* Eyebrow row */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2d3748] bg-[#a8caff0d] px-2.5 py-0.5">
                <span className="text-[10px] font-bold tracking-[0.15em] text-[#a8caff] uppercase">
                  Portfolio
                </span>
              </div>
            </div>

            {/* Value */}
            <h1 className="text-5xl leading-none font-black tracking-tight text-[#ffffff] tabular-nums lg:text-7xl">
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
              <span className="text-xs text-[#a0aec0]">
                · {totalHoldings} holdings · {accounts.length} accounts
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
            <PerformanceChart
              totalGainLoss={totalGainLoss}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              points={history?.points ?? []}
              isLoading={historyLoading}
            />
            <p className="mt-2 text-[10px] text-[#a0aec0]">
              Main chart shows Moneytor-synced history only · per-account sparklines use real data
              where available (Moneytor snapshots or stock price history)
            </p>
          </div>
        ) : null}
      </div>

      {/* ── ALLOCATION BAR ────────────────────────────────────────────────── */}
      {!isLoading && accounts.length > 0 && (
        <div
          className="mt-8 px-4 lg:px-8"
          style={{ animation: 'fadeUp 0.5s 0.18s cubic-bezier(0.32,0.72,0,1) both' }}
        >
          <p className="mb-3 text-[10px] font-bold tracking-[0.15em] text-[#a0aec0] uppercase">
            Allocation
          </p>
          <AllocationBar accounts={accounts} />
        </div>
      )}

      {/* ── PER-ACCOUNT HOLDINGS ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="mt-8">
          <TableSkeleton />
        </div>
      ) : (
        accounts.map((account, i) => (
          <AccountSection
            key={`${account.source}-${account.id}`}
            account={account}
            colorMap={colorMap}
            defaultOpen={true}
            delay={0.24 + i * 0.06}
            sparklinePoints={accountPoints[account.id]}
          />
        ))
      )}

      {/* ── ERROR STATE ───────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-6 flex items-start gap-3 rounded-xl border border-[#f8717133] bg-[#f8717108] p-4 lg:mx-8">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#f87171]">Failed to load portfolio</p>
            <p className="mt-0.5 text-xs text-[#a0aec0]">
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
