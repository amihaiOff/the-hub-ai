/**
 * Unit tests for MobileHeader component
 * Tests logo rendering, hamburger button, and menu click functionality
 */

import { render, screen, fireEvent } from '@testing-library/react';

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

// Mock lucide-react Menu icon
jest.mock('lucide-react', () => ({
  Menu: function MockMenu({ className }: { className?: string }) {
    return <svg data-testid="menu-icon" className={className} />;
  },
}));

// Import after mocks
import { MobileHeader } from '../mobile-header';

describe('MobileHeader', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Logo rendering', () => {
    it('should render the logo with "H" letter', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const logoLetter = screen.getByText('H');
      expect(logoLetter).toBeInTheDocument();
    });

    it('should render "The Hub AI" text', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const logoText = screen.getByText('The Hub AI');
      expect(logoText).toBeInTheDocument();
    });

    it('should render logo as a link to homepage', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const logoLink = screen.getByRole('link');
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });

  describe('Hamburger button rendering', () => {
    it('should render the hamburger menu button', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      expect(menuButton).toBeInTheDocument();
    });

    it('should render the Menu icon', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const menuIcon = screen.getByTestId('menu-icon');
      expect(menuIcon).toBeInTheDocument();
    });

    it('should have accessible label for screen readers', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const menuButton = screen.getByRole('button');
      expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
    });
  });

  describe('Menu button click behavior', () => {
    it('should call onMenuClick when hamburger button is clicked', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      fireEvent.click(menuButton);

      expect(mockOnMenuClick).toHaveBeenCalledTimes(1);
    });

    it('should call onMenuClick on each click', () => {
      const mockOnMenuClick = jest.fn();
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

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
      render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
    });

    it('should have correct responsive class (lg:hidden)', () => {
      const mockOnMenuClick = jest.fn();
      const { container } = render(<MobileHeader onMenuClick={mockOnMenuClick} />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('lg:hidden');
    });
  });
});
