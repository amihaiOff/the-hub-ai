/**
 * Unit tests for MobileHeader component
 * Tests logo rendering, hamburger button, favourites star, and click behaviour
 *
 * The header now renders FavoritesDrawer (stubbed below — it has its own
 * test). The QueryClientProvider wrapper and fetch/navigation/ResizeObserver
 * stubs stay so this file keeps working if the drawer is ever un-stubbed.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

// Mock next/navigation — the drawer's star row derives its target from the path
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage(props: Record<string, unknown>) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />;
  },
}));

// Mock lucide-react icons used by the header
jest.mock('lucide-react', () => ({
  Menu: function MockMenu({ className }: { className?: string }) {
    return <svg data-testid="menu-icon" className={className} />;
  },
  Star: function MockStar({ className }: { className?: string }) {
    return <svg data-testid="star-icon" className={className} />;
  },
}));

// Stub the favourites drawer. This is a MobileHeader unit test: rendering the
// real drawer would drag in TanStack Query, next/navigation and five more
// icons for no benefit — the drawer has its own test.
jest.mock('@/components/favorites/favorites-drawer', () => ({
  FavoritesDrawer: function MockFavoritesDrawer({ open }: { open: boolean }) {
    return open ? <div data-testid="favorites-drawer" /> : null;
  },
}));

// Import after mocks
import { MobileHeader } from '../mobile-header';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderHeader(onMenuClick: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MobileHeader onMenuClick={onMenuClick} />
    </QueryClientProvider>
  );
}

describe('MobileHeader', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });
  });

  describe('Logo rendering', () => {
    it('should render the logo image', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const img = document.querySelector('img[src*="/icons/icon-192.png"]');
      expect(img).toBeInTheDocument();
    });

    it('should render "The Hub" text', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      expect(screen.getByText(/The Hub/)).toBeInTheDocument();
    });

    it('should render logo as a link to homepage', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const logoLink = screen.getByRole('link');
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  describe('Hamburger button rendering', () => {
    it('should render the hamburger menu button', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      expect(menuButton).toBeInTheDocument();
    });

    it('should render the Menu icon', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const menuIcon = screen.getByTestId('menu-icon');
      expect(menuIcon).toBeInTheDocument();
    });

    it('should have accessible label for screen readers', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      // Scoped by name: the header now has a second button (the favourites
      // star), so a bare getByRole('button') would be ambiguous.
      const menuButton = screen.getByRole('button', { name: 'Open menu' });
      expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
    });
  });

  describe('Menu button click behavior', () => {
    it('should call onMenuClick when hamburger button is clicked', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      fireEvent.click(menuButton);

      expect(mockOnMenuClick).toHaveBeenCalledTimes(1);
    });

    it('should call onMenuClick on each click', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      fireEvent.click(menuButton);
      fireEvent.click(menuButton);
      fireEvent.click(menuButton);

      expect(mockOnMenuClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('Header structure', () => {
    it('should render as a header element', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
    });

    it('should have correct responsive class (lg:hidden)', () => {
      const mockOnMenuClick = jest.fn();
      const { container } = renderHeader(mockOnMenuClick);

      const header = container.querySelector('header');
      expect(header).toHaveClass('lg:hidden');
    });
  });
  describe('Favourites star', () => {
    it('should render the favourites star button', () => {
      renderHeader(jest.fn());

      expect(screen.getByRole('button', { name: 'Open favourites' })).toBeInTheDocument();
    });

    it('should push the star to the right edge with ml-auto', () => {
      renderHeader(jest.fn());

      expect(screen.getByRole('button', { name: 'Open favourites' })).toHaveClass('ml-auto');
    });

    it('should open the favourites drawer when clicked', async () => {
      renderHeader(jest.fn());

      expect(screen.queryByTestId('favorites-drawer')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Open favourites' }));

      // The drawer itself is stubbed above; what's under test here is that the
      // header flips its `open` prop.
      expect(await screen.findByTestId('favorites-drawer')).toBeInTheDocument();
    });

    it('should not call onMenuClick when the star is clicked', () => {
      const mockOnMenuClick = jest.fn();
      renderHeader(mockOnMenuClick);

      fireEvent.click(screen.getByRole('button', { name: 'Open favourites' }));

      expect(mockOnMenuClick).not.toHaveBeenCalled();
    });
  });
});
