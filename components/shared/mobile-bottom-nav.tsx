'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navItems } from '@/lib/constants/navigation';

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="border-border/20 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          // For items with sub-items (like Budget), link to the first sub-item
          const href = item.subItems ? item.subItems[0].href : item.href;
          const isActive = item.subItems ? pathname.startsWith(item.href) : pathname === item.href;

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
