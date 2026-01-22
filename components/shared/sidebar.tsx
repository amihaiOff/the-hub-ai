'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import { LogOut, LogIn, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { navItems, settingsItem, type NavItem } from '@/lib/constants/navigation';
import { HouseholdSwitcher } from './household-switcher';
import { ProfileSelector } from './profile-selector';

function NavItemComponent({ item, pathname }: { item: NavItem; pathname: string }) {
  const hasSubItems = item.subItems && item.subItems.length > 0;
  const isParentActive = pathname.startsWith(item.href) && item.href !== '/';
  const isExactActive = pathname === item.href;
  const isActive = hasSubItems ? isParentActive : isExactActive;

  // Track if user has manually toggled the state (null = use default)
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  // Use manual state if set, otherwise default to expanded when active
  const isExpanded = manualExpanded !== null ? manualExpanded : isParentActive;

  const handleToggle = () => {
    setManualExpanded(isExpanded ? false : true);
  };

  const Icon = item.icon;

  if (hasSubItems) {
    return (
      <div>
        <button
          onClick={handleToggle}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
            isParentActive
              ? 'bg-sidebar-accent/50 text-sidebar-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          )}
        >
          <span className="flex items-center gap-3">
            <Icon className="h-5 w-5" />
            {item.label}
          </span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
        </button>
        {isExpanded && (
          <div className="border-sidebar-border/30 mt-1 ml-4 space-y-1 border-l pl-3">
            {item.subItems!.map((subItem) => {
              const isSubActive = pathname === subItem.href;
              const SubIcon = subItem.icon;
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  aria-current={isSubActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
                    isSubActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-glow-sm'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <SubIcon className="h-4 w-4" />
                  {subItem.label}
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
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-glow-sm'
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

  return (
    <aside className="border-sidebar-border/30 bg-sidebar/95 fixed top-0 left-0 hidden h-screen w-64 border-r backdrop-blur-xl lg:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="border-sidebar-border/30 flex h-16 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <span className="text-primary-foreground text-sm font-bold">H</span>
            </div>
            <span className="text-sidebar-foreground text-lg font-semibold">The Hub AI</span>
          </Link>
        </div>

        {/* Household & Profile Selection */}
        {user && (
          <div className="border-sidebar-border/30 space-y-2 border-b p-4">
            <HouseholdSwitcher className="w-full" />
            <ProfileSelector className="w-full justify-between" />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavItemComponent key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

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
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-glow-sm'
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
