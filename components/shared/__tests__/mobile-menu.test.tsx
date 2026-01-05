/**
 * Unit tests for MobileMenu component
 * Tests menu rendering, navigation items, route highlighting, and close behavior
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ReactNode } from 'react';

// Track Sheet open state for testing
let mockSheetOpen = false;
let mockOnOpenChange: ((open: boolean) => void) | null = null;

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
    onOpenChange,
  }: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) {
    mockSheetOpen = open;
    mockOnOpenChange = onOpenChange;
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

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Home: function MockHome({ className }: { className?: string }) {
    return <svg data-testid="icon-home" className={className} />;
  },
  TrendingUp: function MockTrendingUp({ className }: { className?: string }) {
    return <svg data-testid="icon-trending-up" className={className} />;
  },
  Building2: function MockBuilding2({ className }: { className?: string }) {
    return <svg data-testid="icon-building2" className={className} />;
  },
  Wallet: function MockWallet({ className }: { className?: string }) {
    return <svg data-testid="icon-wallet" className={className} />;
  },
  LogOut: function MockLogOut({ className }: { className?: string }) {
    return <svg data-testid="icon-logout" className={className} />;
  },
  LogIn: function MockLogIn({ className }: { className?: string }) {
    return <svg data-testid="icon-login" className={className} />;
  },
}));

// Mock @/lib/utils
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

// Import after mocks
import { MobileMenu } from '../mobile-menu';

describe('MobileMenu', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPathname.mockReturnValue('/');
    mockSheetOpen = false;
    mockOnOpenChange = null;
  });

  describe('Open/Close state', () => {
    it('should render content when open=true', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const sheet = screen.getByTestId('sheet');
      expect(sheet).toBeInTheDocument();
    });

    it('should not render content when open=false', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={false} onOpenChange={mockOnOpenChange} />);

      const sheet = screen.queryByTestId('sheet');
      expect(sheet).not.toBeInTheDocument();
    });

    it('should render SheetContent with side="left"', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const sheetContent = screen.getByTestId('sheet-content');
      expect(sheetContent).toHaveAttribute('data-side', 'left');
    });
  });

  describe('Logo rendering in menu', () => {
    it('should render The Hub AI title in menu header', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const title = screen.getByTestId('sheet-title');
      expect(title).toHaveTextContent('The Hub AI');
    });

    it('should render logo with "H" letter in menu', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const logoLetter = screen.getByText('H');
      expect(logoLetter).toBeInTheDocument();
    });
  });

  describe('Navigation items rendering', () => {
    it('should render all 4 navigation items', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Portfolio')).toBeInTheDocument();
      expect(screen.getByText('Pension')).toBeInTheDocument();
      expect(screen.getByText('Assets')).toBeInTheDocument();
    });

    it('should render Dashboard link with correct href', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('should render Portfolio link with correct href', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const portfolioLink = screen.getByText('Portfolio').closest('a');
      expect(portfolioLink).toHaveAttribute('href', '/portfolio');
    });

    it('should render Pension link with correct href', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const pensionLink = screen.getByText('Pension').closest('a');
      expect(pensionLink).toHaveAttribute('href', '/pension');
    });

    it('should render Assets link with correct href', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const assetsLink = screen.getByText('Assets').closest('a');
      expect(assetsLink).toHaveAttribute('href', '/assets');
    });

    it('should render icons for each navigation item', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      expect(screen.getByTestId('icon-home')).toBeInTheDocument();
      expect(screen.getByTestId('icon-trending-up')).toBeInTheDocument();
      expect(screen.getByTestId('icon-building2')).toBeInTheDocument();
      expect(screen.getByTestId('icon-wallet')).toBeInTheDocument();
    });
  });

  describe('Navigation link click behavior', () => {
    it('should call onOpenChange(false) when Dashboard link is clicked', () => {
      const mockOnOpenChangeFn = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChangeFn} />);

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      fireEvent.click(dashboardLink!);

      expect(mockOnOpenChangeFn).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when Portfolio link is clicked', () => {
      const mockOnOpenChangeFn = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChangeFn} />);

      const portfolioLink = screen.getByText('Portfolio').closest('a');
      fireEvent.click(portfolioLink!);

      expect(mockOnOpenChangeFn).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when Pension link is clicked', () => {
      const mockOnOpenChangeFn = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChangeFn} />);

      const pensionLink = screen.getByText('Pension').closest('a');
      fireEvent.click(pensionLink!);

      expect(mockOnOpenChangeFn).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when Assets link is clicked', () => {
      const mockOnOpenChangeFn = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChangeFn} />);

      const assetsLink = screen.getByText('Assets').closest('a');
      fireEvent.click(assetsLink!);

      expect(mockOnOpenChangeFn).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when logo in header is clicked', () => {
      const mockOnOpenChangeFn = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChangeFn} />);

      // The logo link is in the header
      const sheetHeader = screen.getByTestId('sheet-header');
      const headerLink = sheetHeader.querySelector('a');
      fireEvent.click(headerLink!);

      expect(mockOnOpenChangeFn).toHaveBeenCalledWith(false);
    });
  });

  describe('Active route highlighting with aria-current', () => {
    it('should set aria-current="page" on Dashboard when pathname is "/"', () => {
      mockPathname.mockReturnValue('/');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    });

    it('should not set aria-current on non-active routes', () => {
      mockPathname.mockReturnValue('/');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const portfolioLink = screen.getByText('Portfolio').closest('a');
      expect(portfolioLink).not.toHaveAttribute('aria-current');
    });

    it('should set aria-current="page" on Portfolio when pathname is "/portfolio"', () => {
      mockPathname.mockReturnValue('/portfolio');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const portfolioLink = screen.getByText('Portfolio').closest('a');
      expect(portfolioLink).toHaveAttribute('aria-current', 'page');

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      expect(dashboardLink).not.toHaveAttribute('aria-current');
    });

    it('should set aria-current="page" on Pension when pathname is "/pension"', () => {
      mockPathname.mockReturnValue('/pension');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const pensionLink = screen.getByText('Pension').closest('a');
      expect(pensionLink).toHaveAttribute('aria-current', 'page');
    });

    it('should set aria-current="page" on Assets when pathname is "/assets"', () => {
      mockPathname.mockReturnValue('/assets');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const assetsLink = screen.getByText('Assets').closest('a');
      expect(assetsLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('Active route styling', () => {
    it('should apply active styles to current route', () => {
      mockPathname.mockReturnValue('/portfolio');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const portfolioLink = screen.getByText('Portfolio').closest('a');
      expect(portfolioLink?.className).toContain('bg-accent');
      expect(portfolioLink?.className).toContain('text-accent-foreground');
    });

    it('should apply inactive styles to non-current routes', () => {
      mockPathname.mockReturnValue('/portfolio');
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const dashboardLink = screen.getByText('Dashboard').closest('a');
      expect(dashboardLink?.className).toContain('text-muted-foreground');
    });
  });

  describe('Navigation structure', () => {
    it('should render navigation element', () => {
      const mockOnOpenChange = jest.fn();
      render(<MobileMenu open={true} onOpenChange={mockOnOpenChange} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });
  });
});
