'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useFavorites, useRemoveFavorite } from '@/lib/hooks/use-favorites';
import { usePages } from '@/lib/hooks/use-pages';
import { FavoriteRow } from './favorite-row';
import { StarCurrentRow } from './star-current-row';
import { ManageFavoritesDialog } from './manage-favorites-dialog';

interface FavoritesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Right-side drawer listing the current user's favourites, opened by the star
 * in the mobile header.
 *
 * Mobile-only in the sense that `MobileHeader` is `lg:hidden` — but note that
 * is CSS, not unmounting: this component mounts and its effects run on every
 * page at every viewport. That's why both queries are gated on `open` rather
 * than relying on visibility.
 *
 * Back behaviour: the drawer and the manage modal each own a history entry, so
 * one Back closes the modal first and only closes the drawer when the modal is
 * shut. A single popstate handler coordinates both levels.
 *
 * `useBackToClose` isn't used because it is single-level and this needs two.
 * The two-level version is genuinely trickier: any `back()` WE issue also
 * fires popstate, which would then cascade into the next level down and close
 * the drawer when the user only dismissed the dialog. The `selfBack` ref below
 * exists solely to distinguish our own programmatic back from a real hardware
 * Back — remove it and one tap on the dialog's X closes everything.
 */
export function FavoritesDrawer({ open, onOpenChange }: FavoritesDrawerProps) {
  // Both queries are gated on `open`. This component is mounted by
  // MobileHeader on every page and `lg:hidden` doesn't unmount, so an ungated
  // query here would fire on every page load, desktop included. The cost is
  // that the first open renders page labels from the API's embedded
  // `pageTitle` until /api/pages lands — acceptable, since that fallback is
  // exactly what it's for.
  const { data: favorites = [], isLoading } = useFavorites({ enabled: open });
  const { data: pages = [] } = usePages({ enabled: open });
  const remove = useRemoveFavorite();
  const [manageOpen, setManageOpen] = useState(false);

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  // ─── Two-level Back handling ──────────────────────────────────────────
  const drawerPushed = useRef(false);
  const managePushed = useRef(false);
  // Set immediately before a `history.back()` we issue ourselves, so the
  // popstate it fires isn't mistaken for a hardware Back. Without it, closing
  // the manage modal by its own X / overlay / Esc unwinds that level's entry
  // and the resulting popstate falls through to the drawer level, closing the
  // drawer too. (`useBackToClose` gets this for free: its single-level handler
  // no-ops once its ref is cleared, whereas a two-level handler cascades.)
  const selfBack = useRef(false);

  useEffect(() => {
    if (open && !drawerPushed.current) {
      drawerPushed.current = true;
      window.history.pushState({ level: 'favDrawer' }, '');
    } else if (!open && drawerPushed.current) {
      drawerPushed.current = false;
      if (window.history.state?.level === 'favDrawer') {
        selfBack.current = true;
        window.history.back();
      }
    }
  }, [open]);

  useEffect(() => {
    if (manageOpen && !managePushed.current) {
      managePushed.current = true;
      window.history.pushState({ level: 'favManage' }, '');
    } else if (!manageOpen && managePushed.current) {
      managePushed.current = false;
      if (window.history.state?.level === 'favManage') {
        selfBack.current = true;
        window.history.back();
      }
    }
  }, [manageOpen]);

  useEffect(() => {
    const onPopState = () => {
      // Our own unwinding back() — the state it was undoing is already closed.
      if (selfBack.current) {
        selfBack.current = false;
        return;
      }
      // Deepest level first: close the manage modal, otherwise the drawer.
      if (managePushed.current) {
        managePushed.current = false;
        setManageOpen(false);
      } else if (drawerPushed.current) {
        drawerPushed.current = false;
        onOpenChangeRef.current(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * Closing because the user tapped a favourite and is navigating away.
   *
   * Clears the drawer's history level WITHOUT calling `back()`. Next's router
   * has already pushed the new URL by this point, so our dummy entry is no
   * longer current — issuing `back()` would race the navigation and could undo
   * it. The cost is one leftover history entry carrying the old URL: the first
   * Back looks correct and the second is a no-op, which is strictly better than
   * cancelling the navigation the user just asked for.
   */
  const handleNavigate = () => {
    drawerPushed.current = false;
    onOpenChange(false);
  };

  // If we unmount while still open (e.g. navigating away), unwind our dummy
  // entries — but only while they're still the current ones, so we never undo
  // a real navigation the user just made.
  useEffect(
    () => () => {
      const level = window.history.state?.level;
      const steps = (managePushed.current ? 1 : 0) + (drawerPushed.current ? 1 : 0);
      if (steps > 0 && (level === 'favManage' || level === 'favDrawer')) {
        managePushed.current = false;
        drawerPushed.current = false;
        window.history.go(-steps);
      }
    },
    []
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* `side` already defaults to "right".
            `w-72` mirrors MobileMenu rather than going full-bleed, which keeps
            the overlay tappable as a large dismiss area — the Sheet's own close
            button is a bare `size-4` (16px) target, so full width would leave
            that and hardware Back as the only pointer exits.
            The header's top inset comes from `--safe-pt-base`, NOT a `pt-*`
            utility: `.safe-pt` sets `padding-top` outright, sits later in the
            same `@layer utilities`, and is invisible to `tailwind-merge` — so a
            `pt-12` here silently loses and the title collides with that close
            button. */}
        <SheetContent className="flex w-72 flex-col gap-0 p-0">
          <SheetHeader className="border-border/30 safe-pt flex-row items-center border-b p-4 [--safe-pt-base:3rem]">
            <SheetTitle>Favourites</SheetTitle>
            <SheetDescription className="sr-only">Your pinned pages and sections</SheetDescription>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-11 w-11"
              aria-label="Manage favourites"
              onClick={() => setManageOpen(true)}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </SheetHeader>

          <div className="border-border/30 border-b p-2">
            <StarCurrentRow favorites={favorites} />
          </div>

          {remove.error ? (
            <p
              className="text-destructive border-border/30 border-b px-3 py-2 text-sm"
              role="alert"
            >
              {remove.error.message}
            </p>
          ) : null}

          {/* flex-1 + overflow-y-auto gives the "scrolls once the list is long"
              behaviour without pinning a max-height. */}
          <nav className="safe-pb flex-1 space-y-1 overflow-y-auto p-2 [--safe-pb-base:0.5rem]">
            {isLoading ? (
              <p className="text-muted-foreground p-2 text-sm">Loading…</p>
            ) : favorites.length === 0 ? (
              <p className="text-muted-foreground p-2 text-sm">
                No favourites yet. Tap ★ Star this page above to pin the page you&apos;re on.
              </p>
            ) : (
              favorites.map((favorite) => (
                <FavoriteRow
                  key={favorite.id}
                  favorite={favorite}
                  pages={pages}
                  onNavigate={handleNavigate}
                  onRemove={(id) => remove.mutate(id)}
                />
              ))
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <ManageFavoritesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        favorites={favorites}
        pages={pages}
      />
    </>
  );
}
