'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import { useSyncMoneytor } from '@/lib/hooks/use-moneytor';
import { LogOut, LogIn, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { navItems, settingsItem } from '@/lib/constants/navigation';

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const pathname = usePathname();
  const user = useUser();
  const syncMoneytor = useSyncMoneytor();

  const handleNavClick = () => {
    onOpenChange(false);
  };

  const handleSync = () => {
    syncMoneytor.mutate();
    onOpenChange(false);
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
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.subItems && pathname.startsWith(item.href + '/'));
              const Icon = item.icon;
              const hasSubItems = item.subItems && item.subItems.length > 0 && isActive;

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    aria-current={pathname === item.href ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-all',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                  {hasSubItems && (
                    <div className="border-border/40 mt-0.5 ml-4 space-y-0.5 border-l pl-3">
                      {item.subItems!.map((sub) => {
                        const SubIcon = sub.icon;
                        const subActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={handleNavClick}
                            aria-current={subActive ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-all',
                              subActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                          >
                            <SubIcon className="h-4 w-4" />
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
