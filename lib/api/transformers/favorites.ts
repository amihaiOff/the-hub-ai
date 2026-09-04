/**
 * Serialiser shared by every route that returns a Favorite.
 *
 * Its one real job is deriving `kind`. The schema stores no discriminator
 * column on purpose — the target is fully determined by which of `pageId` /
 * `route` is non-null, and storing `kind` alongside them without a CHECK
 * constraint would create a second source of truth that can disagree with the
 * columns. So the derivation lives here, once, and clients get a clean
 * discriminated union.
 */

/** Page fields the drawer needs. Kept here so every route selects the same set. */
export const FAVORITE_PAGE_SELECT = { id: true, title: true, emoji: true } as const;

/** Shape of a Prisma favourite row with the page relation included. */
export interface FavoriteWithPage {
  id: string;
  pageId: string | null;
  route: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  page: { id: string; title: string; emoji: string | null } | null;
}

export interface FavoriteRow {
  id: string;
  kind: 'page' | 'route';
  pageId: string | null;
  route: string | null;
  /**
   * Cold-cache fallback only. The drawer prefers the live title from the pages
   * query, so a rename shows up immediately via the optimistic write
   * `useUpdatePage` already makes to `pageKeys.list()`.
   */
  pageTitle: string | null;
  pageEmoji: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function toFavoriteRow(favorite: FavoriteWithPage): FavoriteRow {
  return {
    id: favorite.id,
    kind: favorite.pageId ? 'page' : 'route',
    pageId: favorite.pageId,
    route: favorite.route,
    pageTitle: favorite.page?.title ?? null,
    pageEmoji: favorite.page?.emoji ?? null,
    sortOrder: favorite.sortOrder,
    createdAt: favorite.createdAt.toISOString(),
    updatedAt: favorite.updatedAt.toISOString(),
  };
}
