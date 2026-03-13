'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/budget/analysis', label: 'Overall' },
  { href: '/budget/analysis/categories', label: 'Categories' },
];

export function AnalysisTabBar() {
  const pathname = usePathname();

  return (
    <div className="border-border flex gap-1 border-b pb-1">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-t px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary border-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
