/**
 * Component tests for the favourites drawer.
 *
 * Renders the real drawer (Sheet) over a real QueryClient with `fetch` mocked,
 * so `FavoriteRow` and `StarCurrentRow` are exercised through the drawer rather
 * than in isolation. `next/navigation` is mocked the way the other component
 * tests do it, because both the star row's target and a row's active state are
 * derived purely from `usePathname()`.
 *
 * Radix's Dialog needs a couple of DOM APIs jsdom lacks, hence the stubs below.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { pageKeys, type PageListRow } from '@/lib/hooks/use-pages';
import { favoriteKeys, type FavoriteRow as FavoriteRowData } from '@/lib/hooks/use-favorites';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn(() => false);

// Mock next/navigation — the pathname drives both the star row's target and a
// favourite row's active styling.
const mockPathname = jest.fn().mockReturnValue('/');
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    onClick,
    ...props
  }: {
    children: ReactNode;
    href: string;
    onClick?: () => void;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} onClick={onClick} {...props}>
        {children}
      </a>
    );
  };
});

// Import after mocks
import { FavoritesDrawer } from '../favorites-drawer';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeFavorite(overrides: Partial<FavoriteRowData> = {}): FavoriteRowData {
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
    emoji: null,
    sortOrder: 0,
    sectionId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Render the open drawer with both queries pre-seeded (and `fetch` serving the
 * same payloads, so a refetch can't clobber the seed mid-assertion).
 */
async function renderDrawer({
  favorites = [] as FavoriteRowData[],
  pages = [] as PageListRow[],
} = {}) {
  mockFetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => ({
      success: true,
      data: url.startsWith('/api/favorites') ? favorites : pages,
    }),
  }));

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(favoriteKeys.list(), favorites);
  client.setQueryData(pageKeys.list(), pages);

  const onOpenChange = jest.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <FavoritesDrawer open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );

  await screen.findByText('Favourites');
  return { ...view, client, onOpenChange };
}

describe('FavoritesDrawer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPathname.mockReturnValue('/');
  });

  describe('list rendering', () => {
    it('renders the empty-state prompt pointing at the star above it', async () => {
      await renderDrawer();
      expect(
        await screen.findByText(/No favourites yet\. Tap ★ Star this page above/i)
      ).toBeInTheDocument();
    });

    it('renders each favourite with the right href per kind', async () => {
      await renderDrawer({
        favorites: [
          makeFavorite({ id: 'f-page', kind: 'page', pageId: 'p-1', route: null }),
          makeFavorite({ id: 'f-tasks', route: '/tasks', sortOrder: 1 }),
          makeFavorite({ id: 'f-budget', route: '/budget/transactions', sortOrder: 2 }),
        ],
        pages: [makePage({ id: 'p-1', title: 'Roadmap' })],
      });

      expect(await screen.findByRole('link', { name: 'Roadmap' })).toHaveAttribute(
        'href',
        '/areas/p-1'
      );
      expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
      expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
        'href',
        '/budget/transactions'
      );
    });

    it('prefers the live pages-cache title over the API-embedded pageTitle', async () => {
      await renderDrawer({
        favorites: [
          makeFavorite({
            id: 'f-page',
            kind: 'page',
            pageId: 'p-1',
            route: null,
            pageTitle: 'Old name',
          }),
        ],
        pages: [makePage({ id: 'p-1', title: 'Renamed live' })],
      });

      expect(await screen.findByRole('link', { name: 'Renamed live' })).toBeInTheDocument();
      expect(screen.queryByText('Old name')).not.toBeInTheDocument();
    });
  });

  describe('a route favourite whose path is no longer nav-registered', () => {
    it('renders greyed and non-navigable, with a remove button', async () => {
      await renderDrawer({
        favorites: [makeFavorite({ id: 'f-dead', route: '/retired-page' })],
      });

      const removed = await screen.findByText('Removed');
      const row = removed.closest('[aria-disabled="true"]') as HTMLElement;
      expect(row).toBeInTheDocument();
      expect(row).toHaveClass('opacity-50');
      expect(within(row).queryByRole('link')).not.toBeInTheDocument();
      expect(
        within(row).getByRole('button', { name: /remove retired page from favorites/i })
      ).toBeInTheDocument();
    });
  });

  describe('StarCurrentRow', () => {
    it('reports a matching page favourite as starred', async () => {
      mockPathname.mockReturnValue('/areas/p-1');
      await renderDrawer({
        favorites: [makeFavorite({ id: 'f-page', kind: 'page', pageId: 'p-1', route: null })],
        pages: [makePage({ id: 'p-1', title: 'Roadmap' })],
      });

      const star = await screen.findByRole('button', { name: /starred — tap to remove/i });
      expect(star).toHaveAttribute('aria-pressed', 'true');
    });

    it('reports a matching route favourite as starred', async () => {
      mockPathname.mockReturnValue('/budget/transactions');
      await renderDrawer({
        favorites: [makeFavorite({ id: 'f-route', route: '/budget/transactions' })],
      });

      const star = await screen.findByRole('button', { name: /starred — tap to remove/i });
      expect(star).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers to star an unstarred nav route', async () => {
      mockPathname.mockReturnValue('/tasks');
      await renderDrawer();

      const star = await screen.findByRole('button', { name: /star this page/i });
      expect(star).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders the disabled "can\'t be starred" state on an unfavouritable path', async () => {
      mockPathname.mockReturnValue('/wiki/abc123');
      await renderDrawer();

      expect(await screen.findByText(/This page can't be starred/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /star this page/i })).not.toBeInTheDocument();
    });
  });

  describe('data gating', () => {
    it('fetches favourites while open', async () => {
      await renderDrawer();
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith('/api/favorites', expect.any(Object))
      );
    });
  });
});
