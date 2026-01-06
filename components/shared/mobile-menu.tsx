'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, LogIn } from 'lucide-react';
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
import { HouseholdSwitcher } from './household-switcher';
import { ProfileSelector } from './profile-selector';

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const handleNavClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-full flex-col">
          {/* Header with Logo */}
          <SheetHeader className="border-border border-b p-4">
            <Link href="/" className="flex items-center gap-2" onClick={handleNavClick}>
              <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
                <span className="text-primary-foreground text-sm font-bold">H</span>
              </div>
              <SheetTitle className="text-lg font-semibold">The Hub AI</SheetTitle>
            </Link>
            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          </SheetHeader>

          {/* Household & Profile Selection */}
          {session?.user && (
            <div className="border-border space-y-2 border-b p-4">
              <HouseholdSwitcher className="w-full" />
              <ProfileSelector className="w-full justify-between" />
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

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
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
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
          <div className="border-border border-t p-4">
            {status === 'loading' ? (
              <div className="bg-muted h-10 animate-pulse rounded-lg" />
            ) : session?.user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
                      {session.user.name?.[0] || session.user.email?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">{session.user.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{session.user.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    onOpenChange(false);
                    signOut({ callbackUrl: '/auth/signin' });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Button asChild variant="default" size="sm" className="w-full">
                <Link href="/auth/signin" onClick={handleNavClick}>
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
