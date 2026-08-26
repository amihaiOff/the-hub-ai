'use client';

import {
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from 'recharts';
import { formatCurrencyILS } from '@/lib/utils/budget';

type ChartMode = 'pct' | 'value';

interface ChartTooltipPayload {
  payload?: { name?: string; value?: number; pct?: number };
  value?: number;
}

function ChartTooltipCard({
  active,
  payload,
  totalBudget,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  totalBudget?: number;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  const amount = data.value ?? payload[0]?.value ?? 0;
  const pct = data.pct ?? (totalBudget ? (amount / totalBudget) * 100 : 0);
  return (
    <div className="bg-background rounded-lg border p-3 shadow-lg">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground text-sm tabular-nums">{formatCurrencyILS(amount)}</p>
      <p className="text-muted-foreground text-sm tabular-nums">{pct.toFixed(1)}%</p>
    </div>
  );
}

export interface DistributionDatum {
  name: string;
  value: number;
  color: string;
  pct: number;
  groupName?: string;
  isGroupStart?: boolean;
}

/** Compact shekel amount for axis ticks / bar-end labels (₪1.2k, ₪320). */
function fmtCompactShekel(v: number): string {
  return v >= 1000 ? `₪${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₪${Math.round(v)}`;
}

/** Approximate row height used by the bar chart. Must stay in sync with the
 * `ROW` constant in `DistributionBarChart`. */
const GROUP_ROW = 40;
/** Fixed width for the wrapped group label. */
const GROUP_LABEL_WIDTH = 110;
/** Right edge of the group label column (relative to the tick origin). Sits
 * well to the left of the category names so long names never overlap. */
const GROUP_LABEL_RIGHT = -120;

/**
 * Custom Y-axis tick for the grouped (by-category) chart. Renders the
 * category name at the tick's own y-position and, on the first row of
 * each group, ALSO renders that group's label + a subtle vertical
 * bracket spanning every row in the group. The bracket lets the eye
 * connect each category to its group without a big shouty header.
 */
function GroupedYTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string; index?: number };
  data: DistributionDatum[];
}) {
  const { x = 0, y = 0, payload, data } = props;
  const idx = payload?.index ?? -1;
  const datum = idx >= 0 ? data[idx] : undefined;

  // How many consecutive rows share this group — determines the bracket
  // height. Computed by walking forward until the group changes.
  let groupRows = 0;
  if (datum?.isGroupStart) {
    const g = datum.groupName;
    for (let i = idx; i < data.length; i++) {
      if (data[i]?.groupName === g) groupRows++;
      else break;
    }
  }

  // Total vertical span of the group (in tick-local coords). Label sits
  // centred inside a foreignObject sized to this span so wrapping happens
  // in HTML land — SVG <text> can't wrap on its own.
  const spanTop = -GROUP_ROW / 2;
  const spanHeight = groupRows * GROUP_ROW;

  return (
    <g transform={`translate(${x},${y})`}>
      {datum?.isGroupStart && datum.groupName && (
        <foreignObject
          x={GROUP_LABEL_RIGHT - GROUP_LABEL_WIDTH}
          y={spanTop}
          width={GROUP_LABEL_WIDTH}
          height={spanHeight}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              color: 'var(--muted-foreground)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              lineHeight: 1.25,
              textTransform: 'uppercase',
              textAlign: 'right',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            {datum.groupName}
          </div>
        </foreignObject>
      )}
      <text x={0} y={0} dy={4} textAnchor="end" fontSize={12} fill="var(--foreground)">
        {payload?.value ?? ''}
      </text>
    </g>
  );
}

/**
 * Horizontal distribution bar chart for the budget categories page.
 * Lives in its own client component so Recharts can be lazy-loaded
 * (via `next/dynamic`) and stays out of the page's initial bundle.
 */
export function DistributionBarChart({
  data,
  mode,
  grouped = false,
}: {
  data: DistributionDatum[];
  mode: ChartMode;
  grouped?: boolean;
}) {
  const ROW = grouped ? 40 : 36;
  const TOP_BOTTOM = 48;
  const height = Math.max(160, data.length * ROW + TOP_BOTTOM);
  // Absolute (shekel) labels are wider than "xx.x%", so reserve more room.
  const rightMargin = mode === 'value' ? 64 : 56;
  // Left margin holds the YAxis tick labels (category/group names).
  const leftMargin = 8;

  // The bar width and the readouts both follow the selected mode: percentages
  // (0–100) or absolute shekels. Proportions are identical either way — only
  // the numbers on the axis and bar ends change.
  const dataKey = mode === 'pct' ? 'pct' : 'value';
  const xTickFormatter =
    mode === 'pct'
      ? (v: number) => `${Math.round(v)}%`
      : (v: number) =>
          v >= 1000 ? `₪${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₪${Math.round(v)}`;
  const labelFormatter = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v ?? 0);
    return mode === 'pct' ? `${n.toFixed(1)}%` : fmtCompactShekel(n);
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: grouped ? 20 : 8, right: rightMargin, bottom: 24, left: leftMargin }}
          barCategoryGap="25%"
        >
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickFormatter={xTickFormatter}
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            // Widened to hold the group label column drawn to the left of
            // each category name (see GroupedYTick). In the flat
            // (non-grouped) mode the extra space just sits empty.
            width={grouped ? 250 : 130}
            // Render every tick so a group's first-category heading is never
            // thinned away by Recharts' overlap avoidance.
            interval={0}
            tick={
              grouped
                ? (tickProps) => <GroupedYTick {...tickProps} data={data} />
                : { fontSize: 12, fill: '#a1a1aa' }
            }
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => (
              <ChartTooltipCard
                active={active}
                payload={payload as ChartTooltipPayload[] | undefined}
              />
            )}
          />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell key={`b-${i}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey={dataKey}
              position="right"
              formatter={labelFormatter}
              style={{ fill: '#a1a1aa', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
