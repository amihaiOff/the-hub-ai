import { Home, TrendingUp, Building2, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
  { href: '/pension', label: 'Pension', icon: Building2 },
  { href: '/assets', label: 'Assets', icon: Wallet },
];
