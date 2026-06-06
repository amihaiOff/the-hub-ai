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

export function getGroupIconColor(
  groupName: string | null | undefined,
  opts: GetGroupIconOpts = {}
): string {
  if (opts.type === 'income') return 'bg-green-500/15 text-green-500';
  return 'bg-muted text-muted-foreground';
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
