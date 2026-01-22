'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ArrowLeftRight, FolderTree, Tags, Users } from 'lucide-react';

const budgetNavItems = [
  { href: '/budget/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/budget/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/budget/categories', label: 'Categories', icon: FolderTree },
  { href: '/budget/tags', label: 'Tags', icon: Tags },
  { href: '/budget/payees', label: 'Payees', icon: Users },
];

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Mobile Tab Bar - only show on mobile since desktop has sidebar */}
      <div className="border-border bg-background sticky top-16 z-10 border-b lg:hidden">
        <nav className="flex overflow-x-auto px-2 py-1">
          {budgetNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/budget/dashboard' && pathname === '/budget');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
