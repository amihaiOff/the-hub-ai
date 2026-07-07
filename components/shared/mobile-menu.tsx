'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import { useSyncMoneytor } from '@/lib/hooks/use-moneytor';
import { useGeneralLogUnreadCount } from '@/lib/hooks/use-general-log';
import { ChevronDown, LogOut, LogIn, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { navItems, settingsItem, isNavHeader, type NavItem } from '@/lib/constants/navigation';

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Single nav row. When the item has sub-items the row becomes a toggle
 * (tap → expand/collapse, no navigation) and only the sub-items themselves
 * navigate. Mirrors the desktop sidebar's behavior so the parent of a
 * grouping like "Labs" never page-changes on its own.
 */
function MobileNavItem({
  item,
  pathname,
  onNavClick,
  activityUnreadCount = 0,
}: {
  item: NavItem;
  pathname: string;
  onNavClick: () => void;
  activityUnreadCount?: number;
}) {
  const hasSubItems = (item.subItems?.length ?? 0) > 0;
  const Icon = item.icon;
  const parentShowsActivityBadge = item.label === 'Labs' && activityUnreadCount > 0;

  const subItemActive = hasSubItems
    ? (item.subItems ?? []).some((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    : false;
  const isParentActive = hasSubItems
    ? subItemActive || (pathname.startsWith(item.href) && item.href !== '/')
    : pathname === item.href;

  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const isExpanded = manualExpanded !== null ? manualExpanded : isParentActive;

  if (hasSubItems) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setManualExpanded(!isExpanded)}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-all',
            isParentActive
              ? 'bg-accent/50 text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
          aria-expanded={isExpanded}
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
          <div className="border-border/40 mt-0.5 ml-4 space-y-0.5 border-l pl-3">
            {item.subItems!.map((sub) => {
              const SubIcon = sub.icon;
              const subActive = pathname === sub.href;
              const showBadge = sub.href === '/labs/activity' && activityUnreadCount > 0;
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={onNavClick}
                  aria-current={subActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-all',
                    subActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <SubIcon className="h-4 w-4" />
                  <span className="flex-1">{sub.label}</span>
                  {showBadge && <span className="bg-primary h-1.5 w-1.5 rounded-full" />}
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
      onClick={onNavClick}
      aria-current={isParentActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-all',
        isParentActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const pathname = usePathname();
  const user = useUser();
  const syncMoneytor = useSyncMoneytor();
  const { data: activityUnreadCount } = useGeneralLogUnreadCount();

  const handleNavClick = () => {
    onOpenChange(false);
  };

  // Keep the menu open after kicking off a sync — users want to see the
  // spinner spin and the "Syncing…" label change back, not have the sheet
  // close out from under them.
  const handleSync = () => {
    syncMoneytor.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-full flex-col">
          {/* Header with Logo */}
          <SheetHeader className="border-border/30 border-b p-4">
            <Link href="/" className="flex items-center gap-2" onClick={handleNavClick}>
              <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
                <span className="text-primary-foreground text-sm font-bold">H</span>
              </div>
              <SheetTitle className="text-lg font-semibold">The Hub AI</SheetTitle>
            </Link>
            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          </SheetHeader>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((entry) =>
              isNavHeader(entry) ? (
                <p
                  key={entry.header}
                  className="text-muted-foreground px-3 pt-4 pb-1 text-xs font-semibold tracking-wider uppercase"
                >
                  {entry.header}
                </p>
              ) : (
                <MobileNavItem
                  key={entry.href}
                  item={entry}
                  pathname={pathname}
                  onNavClick={handleNavClick}
                  activityUnreadCount={activityUnreadCount ?? 0}
                />
              )
            )}
          </nav>

          {/* Sync data — global Moneytor pull. Sits just above Settings,
              mirroring the desktop sidebar. */}
          <div className="px-4 pt-0 pb-1">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncMoneytor.isPending}
              aria-label="Sync data with Moneytor"
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-all',
                'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
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
                  onClick={handleNavClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-all',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {settingsItem.label}
                </Link>
              );
            })()}
          </div>

          {/* Footer - User Section */}
          <div className="border-border/30 border-t p-4">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {user.profileImageUrl ? (
                    <Image
                      src={user.profileImageUrl}
                      alt={user.displayName || 'User'}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
                      {user.displayName?.[0] || user.primaryEmail?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">{user.displayName}</p>
                    <p className="text-muted-foreground truncate text-xs">{user.primaryEmail}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    onOpenChange(false);
                    user.signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Button asChild variant="default" size="sm" className="w-full">
                <Link href="/handler/sign-in" onClick={handleNavClick}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
