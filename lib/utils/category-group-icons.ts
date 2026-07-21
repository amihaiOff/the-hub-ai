import { createElement } from 'react';
import {
  Home,
  Sparkles,
  PiggyBank,
  Wallet,
  ShoppingBasket,
  Coffee,
  Utensils,
  Stethoscope,
  Car,
  Film,
  Receipt,
  Tag,
  type LucideIcon,
} from 'lucide-react';

interface GetGroupIconOpts {
  type?: 'income' | 'expense';
}

// Map of normalized English name (or substring) → icon. Order matters: the
// first key in this list that is contained in the normalized group name wins.
// Exact seed-name matches (essential / lifestyle / savings & investments) live
// at the top so a more specific keyword later (e.g. "food") doesn't override
// them.
const ICON_RULES: Array<[string, LucideIcon]> = [
  ['essential', Home],
  ['lifestyle', Sparkles],
  ['savings & investments', PiggyBank],
  ['savings', PiggyBank],
  ['investment', PiggyBank],
  ['groceries', ShoppingBasket],
  ['food', ShoppingBasket],
  ['coffee', Coffee],
  ['cafe', Coffee],
  ['restaurant', Utensils],
  ['dining', Utensils],
  ['health', Stethoscope],
  ['medical', Stethoscope],
  ['transport', Car],
  ['transit', Car],
  ['car', Car],
  ['entertainment', Film],
  ['bill', Receipt],
  ['utilit', Receipt],
];

export function getGroupIcon(
  groupName: string | null | undefined,
  opts: GetGroupIconOpts = {}
): LucideIcon {
  if (opts.type === 'income') return Wallet;
  if (!groupName) return Tag;
  const normalized = groupName.trim().toLowerCase();
  if (!normalized) return Tag;
  for (const [keyword, icon] of ICON_RULES) {
    if (normalized.includes(keyword)) return icon;
  }
  return Tag;
}

// Tints by group name — first matching keyword wins. Falls back to a neutral
// muted bubble when nothing matches (Hebrew-only names, custom groups, etc.).
const COLOR_RULES: Array<[string, string]> = [
  ['essential', 'bg-blue-500/15 text-blue-400'],
  ['lifestyle', 'bg-pink-500/15 text-pink-400'],
  ['savings & investments', 'bg-emerald-500/15 text-emerald-400'],
  ['savings', 'bg-emerald-500/15 text-emerald-400'],
  ['investment', 'bg-emerald-500/15 text-emerald-400'],
  ['groceries', 'bg-amber-500/15 text-amber-400'],
  ['food', 'bg-amber-500/15 text-amber-400'],
  ['coffee', 'bg-amber-500/15 text-amber-400'],
  ['cafe', 'bg-amber-500/15 text-amber-400'],
  ['restaurant', 'bg-amber-500/15 text-amber-400'],
  ['dining', 'bg-amber-500/15 text-amber-400'],
  ['health', 'bg-red-500/15 text-red-400'],
  ['medical', 'bg-red-500/15 text-red-400'],
  ['transport', 'bg-cyan-500/15 text-cyan-400'],
  ['transit', 'bg-cyan-500/15 text-cyan-400'],
  ['car', 'bg-cyan-500/15 text-cyan-400'],
  ['entertainment', 'bg-purple-500/15 text-purple-400'],
  ['bill', 'bg-indigo-500/15 text-indigo-400'],
  ['utilit', 'bg-indigo-500/15 text-indigo-400'],
];

export function getGroupIconColor(
  groupName: string | null | undefined,
  opts: GetGroupIconOpts = {}
): string {
  if (opts.type === 'income') return 'bg-green-500/15 text-green-500';
  if (!groupName) return 'bg-muted text-muted-foreground';
  const normalized = groupName.trim().toLowerCase();
  for (const [keyword, classes] of COLOR_RULES) {
    if (normalized.includes(keyword)) return classes;
  }
  return 'bg-muted text-muted-foreground';
}

// Tailwind bar-fill classes per group keyword. Kept as literal strings so the
// Tailwind JIT actually emits them — building class names with .replace()
// would silently drop the variant from the bundle.
const BAR_FILL_RULES: Array<[string, string]> = [
  ['essential', 'bg-blue-500/60'],
  ['lifestyle', 'bg-pink-500/60'],
  ['savings & investments', 'bg-emerald-500/60'],
  ['savings', 'bg-emerald-500/60'],
  ['investment', 'bg-emerald-500/60'],
  ['groceries', 'bg-amber-500/60'],
  ['food', 'bg-amber-500/60'],
  ['coffee', 'bg-amber-500/60'],
  ['cafe', 'bg-amber-500/60'],
  ['restaurant', 'bg-amber-500/60'],
  ['dining', 'bg-amber-500/60'],
  ['health', 'bg-red-500/60'],
  ['medical', 'bg-red-500/60'],
  ['transport', 'bg-cyan-500/60'],
  ['transit', 'bg-cyan-500/60'],
  ['car', 'bg-cyan-500/60'],
  ['entertainment', 'bg-purple-500/60'],
  ['bill', 'bg-indigo-500/60'],
  ['utilit', 'bg-indigo-500/60'],
];

export function getGroupBarFillClass(
  groupName: string | null | undefined,
  opts: GetGroupIconOpts = {}
): string {
  if (opts.type === 'income') return 'bg-green-500/60';
  if (!groupName) return 'bg-foreground/40';
  const normalized = groupName.trim().toLowerCase();
  for (const [keyword, classes] of BAR_FILL_RULES) {
    if (normalized.includes(keyword)) return classes;
  }
  return 'bg-foreground/40';
}

// Hex colors for chart libraries (recharts) — mirrors the keyword rules above
// so the donut/bar chart matches the row icon tint.
const CHART_COLOR_RULES: Array<[string, string]> = [
  ['essential', '#8fb4f5'], // blue-500
  ['lifestyle', '#ec4899'], // pink-500
  ['savings & investments', '#8fd9b6'], // emerald-500
  ['savings', '#8fd9b6'],
  ['investment', '#8fd9b6'],
  ['groceries', '#f5cd85'], // amber-500
  ['food', '#f5cd85'],
  ['coffee', '#f5cd85'],
  ['cafe', '#f5cd85'],
  ['restaurant', '#f5cd85'],
  ['dining', '#f5cd85'],
  ['health', '#f5a5a5'], // red-500
  ['medical', '#f5a5a5'],
  ['transport', '#06b6d4'], // cyan-500
  ['transit', '#06b6d4'],
  ['car', '#06b6d4'],
  ['entertainment', '#a855f7'], // purple-500
  ['bill', '#6366f1'], // indigo-500
  ['utilit', '#6366f1'],
];

const CHART_COLOR_FALLBACKS = [
  '#94a3b8', // slate-400
  '#fb923c', // orange-400
  '#facc15', // yellow-400
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#c9b8f7', // violet-400
  '#f472b6', // pink-400
];

export function getGroupChartColor(
  groupName: string | null | undefined,
  fallbackIndex = 0
): string {
  if (!groupName) return CHART_COLOR_FALLBACKS[fallbackIndex % CHART_COLOR_FALLBACKS.length]!;
  const normalized = groupName.trim().toLowerCase();
  for (const [keyword, color] of CHART_COLOR_RULES) {
    if (normalized.includes(keyword)) return color;
  }
  return CHART_COLOR_FALLBACKS[fallbackIndex % CHART_COLOR_FALLBACKS.length]!;
}

// Stable wrapper that picks the icon and renders it. Avoids the
// `react-hooks/static-components` lint rule that fires when a capitalized
// variable is assigned a function-call result inside a render body.
export function CategoryGroupIcon({
  groupName,
  type,
  className,
}: {
  groupName: string | null | undefined;
  type?: 'income' | 'expense';
  className?: string;
}) {
  return createElement(getGroupIcon(groupName, { type }), { className });
}
