'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navItems, isNavHeader, type NavItem } from '@/lib/constants/navigation';
import { useUncategorizedCount } from '@/lib/hooks/use-budget';

const budgetNavItems =
  navItems.find((item): item is NavItem => !isNavHeader(item) && item.href === '/budget')
    ?.subItems ?? [];

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: countData } = useUncategorizedCount();
  const uncategorizedCount = countData?.uncategorized ?? 0;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Main Content */}
      <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>

      {/* Mobile Bottom Tab Bar - only show on mobile since desktop has sidebar */}
      <nav
        aria-label="Budget navigation"
        className="border-border/20 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:hidden"
      >
        <div className="flex h-16 items-center justify-around">
          {budgetNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/budget/dashboard' && pathname === '/budget');
            const showBadge = item.href === '/budget/transactions' && uncategorizedCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  'flex items-center justify-center px-3 py-2 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="relative">
                  <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                  {showBadge && (
                    <span className="bg-destructive absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" />
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
