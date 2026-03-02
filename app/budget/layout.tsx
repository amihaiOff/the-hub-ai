'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navItems } from '@/lib/constants/navigation';

const budgetNavItems = navItems.find((item) => item.href === '/budget')?.subItems ?? [];

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* Main Content */}
      <main className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>

      {/* Mobile Bottom Tab Bar - only show on mobile since desktop has sidebar */}
      <nav className="border-border/20 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:hidden">
        <div className="flex h-16 items-center justify-around">
          {budgetNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === '/budget/dashboard' && pathname === '/budget');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
