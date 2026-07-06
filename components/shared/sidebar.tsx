'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import { useUncategorizedCount } from '@/lib/hooks/use-budget';
import { useSyncMoneytor } from '@/lib/hooks/use-moneytor';
import { useGeneralLogUnreadCount } from '@/lib/hooks/use-general-log';
import { LogOut, LogIn, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { Button } from '@/components/ui/button';
import { navItems, settingsItem, type NavItem } from '@/lib/constants/navigation';

function NavItemComponent({
  item,
  pathname,
  uncategorizedCount = 0,
  activityUnreadCount = 0,
}: {
  item: NavItem;
  pathname: string;
  uncategorizedCount?: number;
  activityUnreadCount?: number;
}) {
  const hasSubItems = item.subItems && item.subItems.length > 0;
  // Parent is active when the route matches the parent's prefix OR any of its
  // sub-items. Without the subItems check, sections like Labs whose entries
  // live on unrelated prefixes (e.g. /moneytor-trnx vs /moneytor-pension)
  // wouldn't highlight when the user is on one of the non-parent subitems.
  const subItemActive = hasSubItems
    ? (item.subItems ?? []).some((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    : false;
  const isParentActive = (pathname.startsWith(item.href) && item.href !== '/') || subItemActive;
  const isExactActive = pathname === item.href;
  const isActive = hasSubItems ? isParentActive : isExactActive;

  // Track if user has manually toggled the state (null = use default)
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  // Use manual state if set, otherwise default to expanded when active
  const isExpanded = manualExpanded !== null ? manualExpanded : isParentActive;

  const subItemsRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const nextExpanded = !isExpanded;
    setManualExpanded(nextExpanded);
    if (nextExpanded) {
      // The submenu may be below the sidebar's scroll viewport — bring its last
      // subitem into view after the expand animation paints.
      requestAnimationFrame(() => {
        subItemsRef.current?.lastElementChild?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      });
    }
  };

  const Icon = item.icon;
  // Parent-level badge for Labs: dot when any Labs sub-item has unread activity.
  const parentShowsActivityBadge = item.label === 'Labs' && activityUnreadCount > 0;

  if (hasSubItems) {
    return (
      <div>
        <button
          onClick={handleToggle}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            isParentActive
              ? 'bg-sidebar-accent/50 text-sidebar-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          )}
        >
          <span className="flex items-center gap-3">
            <Icon className="h-5 w-5" />
            {item.label}
            {parentShowsActivityBadge && (
              <span className="bg-primary h-1.5 w-1.5 rounded-full" aria-label="Unread activity" />
            )}
          </span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
        </button>
        {isExpanded && (
          <div
            ref={subItemsRef}
            className="border-sidebar-border/30 mt-1 ml-4 space-y-1 border-l pl-3"
          >
            {item.subItems!.map((subItem) => {
              const isSubActive = pathname === subItem.href;
              const SubIcon = subItem.icon;
              const showBadge =
                (subItem.href === '/budget/transactions' && uncategorizedCount > 0) ||
                (subItem.href === '/labs/activity' && activityUnreadCount > 0);
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  aria-current={isSubActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
                    isSubActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <SubIcon className="h-4 w-4" />
                  <span className="flex-1">{subItem.label}</span>
                  {showBadge && <span className="bg-destructive h-2 w-2 rounded-full" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const user = useUser();
  const { data: countData } = useUncategorizedCount();
  const { data: activityUnreadCount } = useGeneralLogUnreadCount();
  const syncMoneytor = useSyncMoneytor();
  const uncategorizedCount = countData?.uncategorized ?? 0;

  return (
    <aside className="border-sidebar-border/30 bg-sidebar fixed top-0 left-0 hidden h-screen w-64 border-r lg:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="border-sidebar-border/30 flex h-16 items-center border-b px-6">
          <Logo />
        </div>

        {/* Navigation. min-h-0 + overflow-y-auto lets the nav scroll on its own
            when expanded submenus push it past the sidebar's fixed height,
            instead of overflowing and hiding Settings/the user footer below.
            A thin scrollbar appears only when content overflows so users
            discover that the nav scrolls. */}
        <nav className="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => (
            <NavItemComponent
              key={item.href}
              item={item}
              pathname={pathname}
              uncategorizedCount={uncategorizedCount}
              activityUnreadCount={activityUnreadCount ?? 0}
            />
          ))}
        </nav>

        {/* Sync data — manual Moneytor pull. Lives just above Settings so
            it's a global action, not a per-page button. Spins while pending. */}
        <div className="px-4 pt-0 pb-1">
          <button
            type="button"
            onClick={() => syncMoneytor.mutate()}
            disabled={syncMoneytor.isPending}
            aria-label="Sync data with Moneytor"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              'disabled:opacity-60'
            )}
          >
            <RefreshCw className={cn('h-5 w-5', syncMoneytor.isPending && 'animate-spin')} />
            {syncMoneytor.isPending ? 'Syncing…' : 'Sync data'}
          </button>
        </div>

        {/* Settings - Bottom of navigation */}
        <div className="p-4 pt-0">
          {(() => {
            const isActive = pathname === settingsItem.href;
            const Icon = settingsItem.icon;
            return (
              <Link
                href={settingsItem.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {settingsItem.label}
              </Link>
            );
          })()}
        </div>

        {/* Footer - User Section */}
        <div className="border-sidebar-border/30 border-t p-4">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {user.profileImageUrl ? (
                  <Image
                    src={user.profileImageUrl}
                    alt={user.displayName || 'User'}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium">
                    {user.displayName?.[0] || user.primaryEmail?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 truncate">
                  <p className="text-sidebar-foreground truncate text-sm font-medium">
                    {user.displayName}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{user.primaryEmail}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-sidebar-foreground w-full justify-start"
                onClick={() => user.signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          ) : (
            <Button asChild variant="default" size="sm" className="w-full">
              <Link href="/handler/sign-in">
                <LogIn className="mr-2 h-4 w-4" />
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
