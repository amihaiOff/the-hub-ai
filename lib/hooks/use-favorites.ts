'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FavoriteRow } from '@/lib/api/transformers/favorites';
import type { CreateFavoriteInput } from '@/lib/validations/favorites';
import { pageKeys, type PageListRow } from '@/lib/hooks/use-pages';
import { favoriteKeys, invalidateFavoritesCache } from '@/lib/hooks/favorite-keys';

export type { FavoriteRow };
// Re-exported so consumers can keep importing everything favourites-related
// from this file; the keys live in their own module to avoid an import cycle
// with `use-pages.ts` (see favorite-keys.ts).
export { favoriteKeys, invalidateFavoritesCache };

// ─── Small fetch helper ─────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

// ─── Queries ────────────────────────────────────────────────────────────

/**
 * The current user's favourites.
 *
 * `enabled` exists so the drawer can gate the fetch on being open — the
 * feature is mobile-only and the trigger carries no state of its own, so
 * there's nothing to load until someone opens it. If the header star ever
 * needs to reflect "current page is starred", this gate has to go and the
 * query starts firing on every mobile page load.
 */
export function useFavorites(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: favoriteKeys.list(),
    queryFn: () => fetchJson<FavoriteRow[]>('/api/favorites'),
    enabled: options?.enabled ?? true,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useAddFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFavoriteInput) =>
      fetchJson<FavoriteRow>('/api/favorites', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: favoriteKeys.lists() });
      const previous = qc.getQueryData<FavoriteRow[]>(favoriteKeys.list());
      if (previous) {
        // Borrow the title from the pages cache so a page favourite doesn't
        // render blank for a frame before the response lands.
        const pages = qc.getQueryData<PageListRow[]>(pageKeys.list());
        const page = input.pageId ? pages?.find((p) => p.id === input.pageId) : undefined;
        const now = new Date().toISOString();
        const optimistic: FavoriteRow = {
          id: `temp-${now}-${input.pageId ?? input.route ?? ''}`,
          kind: input.pageId ? 'page' : 'route',
          pageId: input.pageId ?? null,
          route: input.route ?? null,
          pageTitle: page?.title ?? null,
          pageEmoji: page?.emoji ?? null,
          // Max rather than last-element: doesn't assume the cache is sorted.
          sortOrder: Math.max(...previous.map((f) => f.sortOrder), -1) + 1,
          createdAt: now,
          updatedAt: now,
        };
        qc.setQueryData(favoriteKeys.list(), [...previous, optimistic]);
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(favoriteKeys.list(), ctx.previous);
    },
    onSettled: () => invalidateFavoritesCache(qc),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      // DELETE returns a bare `{ success: true }` with no `data`, so the
      // resolved value really is undefined.
      fetchJson<void>(`/api/favorites/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: favoriteKeys.lists() });
      const previous = qc.getQueryData<FavoriteRow[]>(favoriteKeys.list());
      if (previous) {
        qc.setQueryData(
          favoriteKeys.list(),
          previous.filter((f) => f.id !== id)
        );
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(favoriteKeys.list(), ctx.previous);
    },
    onSettled: () => invalidateFavoritesCache(qc),
  });
}

const REORDER_FAVORITES_KEY = ['reorder-favorites'];

export function useReorderFavorites() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: REORDER_FAVORITES_KEY,
    // `ordered` is the full list of favourite ids in their new order.
    mutationFn: (ordered: string[]) =>
      fetchJson<{ updated: number }>('/api/favorites/reorder', {
        method: 'POST',
        body: JSON.stringify({
          favorites: ordered.map((id, index) => ({ id, sortOrder: index })),
        }),
      }),
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: favoriteKeys.lists() });
      const previous = qc.getQueryData<FavoriteRow[]>(favoriteKeys.list());
      if (previous) {
        const byId = new Map(previous.map((f) => [f.id, f]));
        const next = ordered
          .map((id, index) => {
            const fav = byId.get(id);
            return fav ? { ...fav, sortOrder: index } : null;
          })
          .filter((f): f is FavoriteRow => f !== null);
        qc.setQueryData(favoriteKeys.list(), next);
      }
      return { previous };
    },
    onError: (_err, _ordered, ctx) => {
      if (ctx?.previous) qc.setQueryData(favoriteKeys.list(), ctx.previous);
    },
    onSettled: () => {
      // Only the last outstanding reorder refetches, so a slower earlier
      // request can't snap the list back over a newer optimistic order.
      if (qc.isMutating({ mutationKey: REORDER_FAVORITES_KEY }) <= 1) {
        invalidateFavoritesCache(qc);
      }
    },
  });
}
