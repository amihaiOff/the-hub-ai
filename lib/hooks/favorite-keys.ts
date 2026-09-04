/**
 * Favourites query keys + cache invalidation, in their own module rather than
 * in `use-favorites.ts`.
 *
 * Why the split: `use-favorites.ts` imports `pageKeys` from `use-pages.ts` (to
 * borrow a page title for optimistic adds), and `use-pages.ts` needs to
 * invalidate favourites when a page is deleted (the DB cascades those rows away
 * and the favourites cache can't observe it). Keeping the keys here breaks what
 * would otherwise be a circular import between the two hook files.
 */

export const favoriteKeys = {
  all: ['favorites'] as const,
  lists: () => [...favoriteKeys.all, 'list'] as const,
  list: () => [...favoriteKeys.lists()] as const,
};

type MinimalQueryClient = {
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown;
};

export function invalidateFavoritesCache(client: MinimalQueryClient) {
  client.invalidateQueries({ queryKey: favoriteKeys.lists() });
}
