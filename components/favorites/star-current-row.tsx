'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddFavorite, useRemoveFavorite, type FavoriteRow } from '@/lib/hooks/use-favorites';
import { useCurrentDestination } from './use-current-destination';

interface StarCurrentRowProps {
  favorites: FavoriteRow[];
}

/**
 * The only way to add a favourite.
 *
 * A star in the Areas page header was the original plan, but it can only ever
 * reach Areas pages — this row reads whatever the current location is, so one
 * control covers both target kinds. It also makes the empty state
 * self-fulfilling: the prompt below it points at the button directly above.
 */
export function StarCurrentRow({ favorites }: StarCurrentRowProps) {
  const dest = useCurrentDestination();
  const add = useAddFavorite();
  const remove = useRemoveFavorite();

  // One lookup answers "already starred?" and yields the id to un-star with.
  const existing = dest
    ? favorites.find((f) =>
        dest.kind === 'page' ? f.pageId === dest.pageId : f.route === dest.route
      )
    : undefined;

  if (!dest) {
    return (
      <div className="text-muted-foreground flex h-11 items-center gap-3 px-3 text-sm opacity-60">
        <Star className="h-4 w-4 shrink-0" />
        <span className="truncate">This page can&apos;t be starred</span>
      </div>
    );
  }

  const busy = add.isPending || remove.isPending;
  const starred = !!existing;
  const error = add.error ?? remove.error;

  return (
    <>
      {error ? (
        <p className="text-destructive px-3 pb-1 text-sm" role="alert">
          {error.message}
        </p>
      ) : null}
      <button
        type="button"
        aria-pressed={starred}
        disabled={busy}
        onClick={() => {
          if (busy) return;
          if (existing) {
            remove.mutate(existing.id);
          } else {
            add.mutate(dest.kind === 'page' ? { pageId: dest.pageId } : { route: dest.route });
          }
        }}
        className={cn(
          'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          'hover:bg-secondary/60 disabled:opacity-60',
          starred ? 'text-foreground font-medium' : 'text-muted-foreground'
        )}
      >
        <Star className={cn('h-4 w-4 shrink-0', starred && 'fill-current')} />
        <span className="truncate">{starred ? 'Starred — tap to remove' : 'Star this page'}</span>
      </button>
    </>
  );
}
