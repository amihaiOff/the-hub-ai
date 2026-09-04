/**
 * Unit tests for the favourites hooks (TanStack Query).
 *
 * Exercises the list query and all three mutations' optimistic
 * onMutate/onError/onSettled callbacks. The reorder concurrency guard gets its
 * own test: `onSettled` only invalidates when it is the last outstanding
 * reorder, so a slower earlier request can't snap the list back over a newer
 * optimistic order.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { pageKeys, type PageListRow } from '../use-pages';
import {
  favoriteKeys,
  useFavorites,
  useAddFavorite,
  useRemoveFavorite,
  useReorderFavorites,
  type FavoriteRow,
} from '../use-favorites';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

function ok<T>(data: T) {
  return { ok: true, json: async () => ({ success: true, data }) };
}

function err(error = 'boom') {
  return { ok: false, json: async () => ({ success: false, error }) };
}

// gcTime: Infinity keeps optimistically-patched entries in the cache so tests
// can inspect them after onSettled invalidation.
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeFavorite(overrides: Partial<FavoriteRow> = {}): FavoriteRow {
  return {
    id: 'f-1',
    kind: 'route',
    pageId: null,
    route: '/tasks',
    pageTitle: null,
    pageEmoji: null,
    sortOrder: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePage(overrides: Partial<PageListRow> = {}): PageListRow {
  return {
    id: 'p-1',
    title: 'Roadmap',
    emoji: '🗺️',
    sortOrder: 0,
    sectionId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A fetch mock whose response the test resolves by hand. */
function deferredFetch<T>(data: T) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockFetch.mockImplementationOnce(async () => {
    await gate;
    return ok(data);
  });
  return release;
}

describe('Favorite Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── favoriteKeys ──────────────────────────────────────────────────────
  describe('favoriteKeys', () => {
    it('all', () => {
      expect(favoriteKeys.all).toEqual(['favorites']);
    });

    it('lists and list share a key (there are no filters)', () => {
      expect(favoriteKeys.lists()).toEqual(['favorites', 'list']);
      expect(favoriteKeys.list()).toEqual(['favorites', 'list']);
    });
  });

  // ─── useFavorites ──────────────────────────────────────────────────────
  describe('useFavorites', () => {
    it('fetches the list', async () => {
      const rows = [makeFavorite()];
      mockFetch.mockResolvedValueOnce(ok(rows));

      const { result } = renderHook(() => useFavorites(), { wrapper: wrapperFor(makeClient()) });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(rows);
      expect(mockFetch).toHaveBeenCalledWith('/api/favorites', expect.any(Object));
    });

    it('does not fetch when disabled (the drawer gates on being open)', () => {
      renderHook(() => useFavorites({ enabled: false }), { wrapper: wrapperFor(makeClient()) });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('surfaces the API error message', async () => {
      mockFetch.mockResolvedValueOnce(err('nope'));
      const { result } = renderHook(() => useFavorites(), { wrapper: wrapperFor(makeClient()) });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('nope');
    });
  });

  // ─── useAddFavorite ────────────────────────────────────────────────────
  describe('useAddFavorite', () => {
    it('appends an optimistic row before the response resolves', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      client.setQueryData(key, [makeFavorite({ id: 'f-1', route: '/tasks' })]);

      const release = deferredFetch(makeFavorite({ id: 'f-real', route: '/budget' }));

      const { result } = renderHook(() => useAddFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate({ route: '/budget' });

      // Optimistic append is visible while the request is still in flight.
      await waitFor(() => expect(client.getQueryData<FavoriteRow[]>(key)).toHaveLength(2));
      const optimistic = client.getQueryData<FavoriteRow[]>(key)![1];
      expect(optimistic).toMatchObject({ kind: 'route', route: '/budget', sortOrder: 1 });
      expect(optimistic.id).toMatch(/^temp-/);
      expect(result.current.isPending).toBe(true);

      release();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('borrows the page title and emoji from the pages cache', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      client.setQueryData(key, []);
      client.setQueryData(pageKeys.list(), [makePage({ id: 'p-9', title: 'Trip', emoji: '✈️' })]);

      const release = deferredFetch(makeFavorite({ id: 'f-real', kind: 'page', pageId: 'p-9' }));

      const { result } = renderHook(() => useAddFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate({ pageId: 'p-9' });

      await waitFor(() => expect(client.getQueryData<FavoriteRow[]>(key)).toHaveLength(1));
      expect(client.getQueryData<FavoriteRow[]>(key)![0]).toMatchObject({
        kind: 'page',
        pageId: 'p-9',
        pageTitle: 'Trip',
        pageEmoji: '✈️',
        sortOrder: 0,
      });

      release();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('restores the exact snapshot on error', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      const snapshot = [makeFavorite({ id: 'f-1' })];
      client.setQueryData(key, snapshot);

      mockFetch.mockResolvedValueOnce(err('Already in favorites'));

      const { result } = renderHook(() => useAddFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate({ route: '/budget' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(client.getQueryData<FavoriteRow[]>(key)).toEqual(snapshot);
      expect(result.current.error?.message).toBe('Already in favorites');
    });

    it('POSTs the input body as-is', async () => {
      const client = makeClient();
      mockFetch.mockResolvedValueOnce(ok(makeFavorite()));

      const { result } = renderHook(() => useAddFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate({ route: '/budget' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/favorites',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ route: '/budget' }) })
      );
    });
  });

  // ─── useRemoveFavorite ─────────────────────────────────────────────────
  describe('useRemoveFavorite', () => {
    it('filters the row out immediately', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      client.setQueryData(key, [makeFavorite({ id: 'f-1' }), makeFavorite({ id: 'f-2' })]);

      const release = deferredFetch({ ok: true });

      const { result } = renderHook(() => useRemoveFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate('f-1');

      await waitFor(() =>
        expect(client.getQueryData<FavoriteRow[]>(key)!.map((f) => f.id)).toEqual(['f-2'])
      );
      expect(result.current.isPending).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/favorites/f-1',
        expect.objectContaining({ method: 'DELETE' })
      );

      release();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('restores the removed row on error', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      const snapshot = [makeFavorite({ id: 'f-1' }), makeFavorite({ id: 'f-2' })];
      client.setQueryData(key, snapshot);

      mockFetch.mockResolvedValueOnce(err('Not found'));

      const { result } = renderHook(() => useRemoveFavorite(), { wrapper: wrapperFor(client) });
      result.current.mutate('f-1');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(client.getQueryData<FavoriteRow[]>(key)).toEqual(snapshot);
    });
  });

  // ─── useReorderFavorites ───────────────────────────────────────────────
  describe('useReorderFavorites', () => {
    it('POSTs {favorites:[{id,sortOrder}]} and reorders the cache optimistically', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      client.setQueryData(key, [
        makeFavorite({ id: 'f-1', sortOrder: 0 }),
        makeFavorite({ id: 'f-2', sortOrder: 1 }),
      ]);

      mockFetch.mockResolvedValueOnce(ok({ updated: 2 }));

      const { result } = renderHook(() => useReorderFavorites(), { wrapper: wrapperFor(client) });
      result.current.mutate(['f-2', 'f-1']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/favorites/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            favorites: [
              { id: 'f-2', sortOrder: 0 },
              { id: 'f-1', sortOrder: 1 },
            ],
          }),
        })
      );
      const cached = client.getQueryData<FavoriteRow[]>(key)!;
      expect(cached.map((f) => f.id)).toEqual(['f-2', 'f-1']);
      expect(cached.map((f) => f.sortOrder)).toEqual([0, 1]);
    });

    it('rolls back the order on error', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      const snapshot = [
        makeFavorite({ id: 'f-1', sortOrder: 0 }),
        makeFavorite({ id: 'f-2', sortOrder: 1 }),
      ];
      client.setQueryData(key, snapshot);

      mockFetch.mockResolvedValueOnce(err('Failed to reorder'));

      const { result } = renderHook(() => useReorderFavorites(), { wrapper: wrapperFor(client) });
      result.current.mutate(['f-2', 'f-1']);

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(client.getQueryData<FavoriteRow[]>(key)).toEqual(snapshot);
    });

    it('two in-flight reorders invalidate only once (the isMutating guard)', async () => {
      const client = makeClient();
      const key = favoriteKeys.list();
      client.setQueryData(key, [
        makeFavorite({ id: 'f-1', sortOrder: 0 }),
        makeFavorite({ id: 'f-2', sortOrder: 1 }),
      ]);
      const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

      const releaseFirst = deferredFetch({ updated: 2 });
      const releaseSecond = deferredFetch({ updated: 2 });

      const { result } = renderHook(() => useReorderFavorites(), { wrapper: wrapperFor(client) });

      // Two overlapping reorders. The earlier one settles while the newer is
      // still in flight, so it must NOT invalidate — otherwise its refetch
      // would snap the list back over the newer optimistic order.
      const first = result.current.mutateAsync(['f-2', 'f-1']);
      const second = result.current.mutateAsync(['f-1', 'f-2']);

      await waitFor(() =>
        expect(client.isMutating({ mutationKey: ['reorder-favorites'] })).toBe(2)
      );

      releaseFirst();
      await first;
      expect(
        invalidateSpy.mock.calls.filter(
          (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(favoriteKeys.lists())
        )
      ).toHaveLength(0);

      releaseSecond();
      await second;

      const favoriteInvalidations = invalidateSpy.mock.calls.filter(
        (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(favoriteKeys.lists())
      );
      expect(favoriteInvalidations).toHaveLength(1);
    });
  });
});
