/**
 * Unit tests for MobileMenu component
 * Tests menu rendering, navigation items, route highlighting, and close behavior
 *
 * Refactored to use test.each for repetitive test cases
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ReactNode } from 'react';

// Mock next/navigation
const mockPathname = jest.fn().mockReturnValue('/');
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// Mock next-auth/react
const mockSession = {
  user: {
    name: 'Test User',
    email: 'test@example.com',
    image: null,
  },
};
const mockStatus = 'authenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mockStatus === 'authenticated' ? mockSession : null,
    status: mockStatus,
  }),
  signOut: jest.fn(),
}));

// Mock next/link
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

// Mock next/image
jest.mock('next/image', () => {
  return function MockImage({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
  }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} width={width} height={height} className={className} />;
  };
});

// Mock @/components/ui/sheet
jest.mock('@/components/ui/sheet', () => ({
  Sheet: function MockSheet({
    children,
    open,
  }: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
    return open ? <div data-testid="sheet">{children}</div> : null;
  },
  SheetContent: function MockSheetContent({
    children,
    side,
    className,
  }: {
    children: ReactNode;
    side?: string;
    className?: string;
  }) {
    return (
      <div data-testid="sheet-content" data-side={side} className={className}>
        {children}
      </div>
    );
  },
  SheetHeader: function MockSheetHeader({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) {
    return (
      <div data-testid="sheet-header" className={className}>
        {children}
      </div>
    );
  },
  SheetTitle: function MockSheetTitle({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) {
    return (
      <h2 data-testid="sheet-title" className={className}>
        {children}
      </h2>
    );
  },
  SheetDescription: function MockSheetDescription({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) {
    return (
      <p data-testid="sheet-description" className={className}>
        {children}
      </p>
    );
  },
}));

// Mock @/components/ui/button
jest.mock('@/components/ui/button', () => ({
  Button: function MockButton({
    children,
    onClick,
    asChild,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    [key: string]: unknown;
  }) {
    if (asChild) {
      return children;
    }
    return (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    );
  },
}));

// Create mock icon component factory
const createMockIcon = (testId: string) => {
  return function MockIcon({ className }: { className?: string }) {
    return <svg data-testid={testId} className={className} />;
  };
};

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Home: createMockIcon('icon-home'),
  TrendingUp: createMockIcon('icon-trending-up'),
  Building2: createMockIcon('icon-building2'),
  Wallet: createMockIcon('icon-wallet'),
  Settings: createMockIcon('icon-settings'),
  LogOut: createMockIcon('icon-logout'),
  LogIn: createMockIcon('icon-login'),
}));

// Mock navigation constants to ensure icons are properly mocked
jest.mock('@/lib/constants/navigation', () => ({
  navItems: [
    { href: '/', label: 'Dashboard', icon: createMockIcon('icon-home') },
    { href: '/portfolio', label: 'Portfolio', icon: createMockIcon('icon-trending-up') },
    { href: '/pension', label: 'Pension', icon: createMockIcon('icon-building2') },
    { href: '/assets', label: 'Assets', icon: createMockIcon('icon-wallet') },
  ],
  settingsItem: { href: '/settings', label: 'Settings', icon: createMockIcon('icon-settings') },
}));

// Mock @/lib/utils
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

// Mock HouseholdSwitcher component which uses HouseholdContext
jest.mock('../household-switcher', () => ({
  HouseholdSwitcher: function MockHouseholdSwitcher({ className }: { className?: string }) {
    return (
      <div data-testid="household-switcher" className={className}>
        Mock Household Switcher
      </div>
    );
  },
}));

// Mock ProfileSelector component which uses HouseholdContext
jest.mock('../profile-selector', () => ({
  ProfileSelector: function MockProfileSelector({ className }: { className?: string }) {
    return (
      <div data-testid="profile-selector" className={className}>
        Mock Profile Selector
      </div>
    );
  },
}));

// Import after mocks
import { MobileMenu } from '../mobile-menu';

describe('MobileMenu', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPathname.mockReturnValue('/');
  });

  describe('Open/Close state', () => {
    it('should render content when open=true', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByTestId('sheet')).toBeInTheDocument();
    });

    it('should not render content when open=false', () => {
      render(<MobileMenu open={false} onOpenChange={jest.fn()} />);
      expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    });

    it('should render SheetContent with side="left"', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByTestId('sheet-content')).toHaveAttribute('data-side', 'left');
    });
  });

  describe('Logo and header', () => {
    it('should render The Hub AI title and logo in menu header', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByTestId('sheet-title')).toHaveTextContent('The Hub AI');
      expect(screen.getByText('H')).toBeInTheDocument();
    });
  });

  describe('Navigation items rendering', () => {
    const navItems = [
      { label: 'Dashboard', href: '/', iconTestId: 'icon-home' },
      { label: 'Portfolio', href: '/portfolio', iconTestId: 'icon-trending-up' },
      { label: 'Pension', href: '/pension', iconTestId: 'icon-building2' },
      { label: 'Assets', href: '/assets', iconTestId: 'icon-wallet' },
    ];

    it('should render all navigation items with correct hrefs and icons', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);

      navItems.forEach(({ label, href, iconTestId }) => {
        expect(screen.getByText(label)).toBeInTheDocument();
        const link = screen.getByText(label).closest('a');
        expect(link).toHaveAttribute('href', href);
        expect(screen.getByTestId(iconTestId)).toBeInTheDocument();
      });
    });

    it('should render navigation element', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('Navigation link click behavior', () => {
    const clickTestCases = [
      { label: 'Dashboard' },
      { label: 'Portfolio' },
      { label: 'Pension' },
      { label: 'Assets' },
      { label: 'Settings' },
    ];

    it.each(clickTestCases)(
      'should call onOpenChange(false) when $label link is clicked',
      ({ label }) => {
        const mockOnOpenChange = jest.fn();
        render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

        const link = screen.getByText(label).closest('a');
        fireEvent.click(link!);

        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      }
    );

    it('should call onOpenChange(false) when logo in header is clicked', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const sheetHeader = screen.getByTestId('sheet-header');
      const headerLink = sheetHeader.querySelector('a');
      fireEvent.click(headerLink!);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Active route highlighting', () => {
    const routeTestCases = [
      { pathname: '/', activeLabel: 'Dashboard' },
      { pathname: '/portfolio', activeLabel: 'Portfolio' },
      { pathname: '/pension', activeLabel: 'Pension' },
      { pathname: '/assets', activeLabel: 'Assets' },
      { pathname: '/settings', activeLabel: 'Settings' },
    ];

    it.each(routeTestCases)(
      'should highlight $activeLabel when pathname is "$pathname"',
      ({ pathname, activeLabel }) => {
        mockPathname.mockReturnValue(pathname);
        render(<MobileMenu open={true} onOpenChange={jest.fn()} />);

        const activeLink = screen.getByText(activeLabel).closest('a');
        expect(activeLink).toHaveAttribute('aria-current', 'page');
        expect(activeLink?.className).toContain('bg-accent');
        expect(activeLink?.className).toContain('text-accent-foreground');
      }
    );

    it('should not highlight non-active routes', () => {
      mockPathname.mockReturnValue('/portfolio');
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      expect(dashboardLink).not.toHaveAttribute('aria-current');
      expect(dashboardLink?.className).toContain('text-muted-foreground');
    });
  });

  describe('Settings navigation item', () => {
    it('should render Settings link with correct href and icon', () => {
      render(<MobileMenu open={true} onOpenChange={jest.fn()} />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
      const settingsLink = screen.getByText('Settings').closest('a');
      expect(settingsLink).toHaveAttribute('href', '/settings');
      expect(screen.getByTestId('icon-settings')).toBeInTheDocument();
    });
  });
});
