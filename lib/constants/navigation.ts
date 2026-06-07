import {
  Home,
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

export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: TrendingUp,
    subItems: [
      { href: '/portfolio', label: 'Original Design', icon: LayoutDashboard },
      { href: '/portfolio/v2', label: 'New Design', icon: Sparkles },
    ],
  },
  { href: '/pension', label: 'Pension', icon: Building2 },
  {
    href: '/assets',
    label: 'Assets',
    icon: Wallet,
    subItems: [
      { href: '/assets', label: 'Overview', icon: LayoutDashboard },
      { href: '/assets/mortgage-simulator', label: 'Mortgage Simulator', icon: Calculator },
    ],
  },
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
    href: '/shopping',
    label: 'Shopping',
    icon: ShoppingCart,
    subItems: [
      { href: '/shopping', label: 'Cart', icon: ShoppingCart },
      { href: '/shopping/items', label: 'Items', icon: Package },
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
      { href: '/moneytor-trnx', label: 'Moneytor Trnx', icon: ArrowLeftRight },
      { href: '/moneytor-pension', label: 'Moneytor Pension', icon: PiggyBank },
    ],
  },
];

export const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings };
