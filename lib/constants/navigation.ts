import {
  TrendingUp,
  Building2,
  Wallet,
  Receipt,
  Settings,
  LayoutDashboard,
  ArrowLeftRight,
  FolderTree,
  Tags,
  Users,
  BarChart3,
  PiggyBank,
  Shield,
  Calculator,
  Sparkles,
  ShoppingCart,
  Package,
  FlaskConical,
  Trash2,
  History,
  ListChecks,
  Activity,
  DollarSign,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

export interface NavSubItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  subItems?: NavSubItem[];
}

/** A non-clickable section label that groups the nav items below it. */
export interface NavHeader {
  header: string;
}

export type NavEntry = NavItem | NavHeader;

export function isNavHeader(entry: NavEntry): entry is NavHeader {
  return 'header' in entry;
}

export const navItems: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/wiki', label: 'Wiki', icon: BookOpen },
  {
    href: '/shopping',
    label: 'Shopping',
    icon: ShoppingCart,
    subItems: [
      { href: '/shopping', label: 'Cart', icon: ShoppingCart },
      { href: '/shopping/items', label: 'Items', icon: Package },
    ],
  },
  { header: 'Finances' },
  { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { href: '/pension', label: 'Pension', icon: Building2 },
  { href: '/assets', label: 'Assets', icon: Wallet },
  { href: '/insurance', label: 'Insurance', icon: Shield },
  {
    href: '/budget',
    label: 'Budget',
    icon: Receipt,
    subItems: [
      { href: '/budget/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/budget/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { href: '/budget/categories', label: 'Categories', icon: FolderTree },
      { href: '/budget/tags', label: 'Tags', icon: Tags },
      { href: '/budget/payees', label: 'Payees', icon: Users },
      { href: '/budget/analysis', label: 'Analysis', icon: BarChart3 },
      { href: '/budget/savings', label: 'Savings', icon: PiggyBank },
    ],
  },
  {
    // Labs — experimental/raw-debug pages. The parent's href is used only by
    // `isParentActive` (pathname.startsWith) so the section highlights when
    // the user is on any of its subitems.
    href: '/moneytor-trnx',
    label: 'Labs',
    icon: FlaskConical,
    subItems: [
      { href: '/labs/mortgage-simulator', label: 'Mortgage Simulator', icon: Calculator },
      { href: '/moneytor-trnx', label: 'Moneytor Trnx', icon: ArrowLeftRight },
      { href: '/labs/dropped-trnx', label: 'Dropped Trnx', icon: Trash2 },
      { href: '/labs/sync-log', label: 'Sync Log', icon: History },
      { href: '/labs/activity', label: 'Activity', icon: Activity },
      { href: '/labs/categorization-log', label: 'AI Categorization', icon: Sparkles },
      { href: '/labs/ai-usage', label: 'AI Spend', icon: DollarSign },
    ],
  },
];

export const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings };
