'use client';

import { useState } from 'react';
import { Menu, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoritesDrawer } from '@/components/favorites/favorites-drawer';
import { Logo } from './logo';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

/**
 * The mobile top bar: hamburger + wordmark on the left, favourites star on the
 * right.
 *
 * The favourites drawer's open state lives here rather than in `AppShell`
 * (which owns `menuOpen`) on purpose: this header is already `lg:hidden`, so
 * keeping the drawer inside it makes the whole feature structurally unreachable
 * on desktop with no `AppShell` changes and no `useIsMobileViewport()` mount
 * flash. The cost is that this stops being a purely presentational component.
 */
export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  return (
    <header
      className="border-border bg-background safe-pt safe-px flex items-center gap-2 border-b p-4 lg:hidden"
      style={{ ['--safe-pt-base' as string]: '1rem', ['--safe-px-base' as string]: '1rem' }}
    >
      <Button variant="ghost" size="icon" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <Logo />
      {/* `ml-auto` is load-bearing: the header is a plain flex row with no
          `justify-between` and nothing else on the right. */}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        onClick={() => setFavoritesOpen(true)}
        aria-label="Open favourites"
      >
        <Star className="h-5 w-5" />
      </Button>
      <FavoritesDrawer open={favoritesOpen} onOpenChange={setFavoritesOpen} />
    </header>
  );
}
