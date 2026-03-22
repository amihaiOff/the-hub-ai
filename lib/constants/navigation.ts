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
];

export const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings };
