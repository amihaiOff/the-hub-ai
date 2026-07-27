/**
 * Unit tests for navigation constants
 * Tests navItems structure, ordering, and the Finances section header.
 */

import { navItems, settingsItem, isNavHeader, NavItem } from '../navigation';
import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  Wallet,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  ListChecks,
  FlaskConical,
  BookOpen,
} from 'lucide-react';

// The clickable nav entries (headers filtered out).
const linkItems = navItems.filter((e): e is NavItem => !isNavHeader(e));

describe('Navigation Constants', () => {
  describe('navItems array structure', () => {
    it('should have valid structure for every link item', () => {
      expect(Array.isArray(navItems)).toBe(true);
      expect(linkItems).toHaveLength(10);

      linkItems.forEach((item) => {
        expect(typeof item.href).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(item.href.length).toBeGreaterThan(0);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.href).toMatch(/^\//);
        // LucideIcon components are ForwardRef objects or functions
        expect(['function', 'object'].includes(typeof item.icon)).toBe(true);
      });
    });

    it('should have unique hrefs, labels, and icons among link items', () => {
      const hrefs = linkItems.map((item) => item.href);
      const labels = linkItems.map((item) => item.label);
      const icons = linkItems.map((item) => item.icon);

      expect(new Set(hrefs).size).toBe(hrefs.length);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(icons).size).toBe(icons.length);
    });
  });

  describe('navItems content and order', () => {
    const expectedItems = [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Tasks', href: '/tasks', icon: ListChecks },
      { label: 'Wiki', href: '/wiki', icon: BookOpen },
      { label: 'Shopping', href: '/shopping', icon: ShoppingCart },
      { label: 'Portfolio', href: '/portfolio', icon: TrendingUp },
      { label: 'Pension', href: '/pension', icon: Building2 },
      { label: 'Assets', href: '/assets', icon: Wallet },
      { label: 'Insurance', href: '/insurance', icon: Shield },
      { label: 'Budget', href: '/budget', icon: Receipt },
      { label: 'Labs', href: '/moneytor-trnx', icon: FlaskConical },
    ];

    it.each(expectedItems.map((item, index) => [index, item.label, item.href, item.icon]))(
      'should have link item at position %i be "%s" with href "%s"',
      (index, label, href, icon) => {
        const item = linkItems[index as number];
        expect(item.label).toBe(label);
        expect(item.href).toBe(href);
        expect(item.icon).toBe(icon);
      }
    );

    it('should place a Finances section header before the finance links', () => {
      const financesIndex = navItems.findIndex((e) => isNavHeader(e) && e.header === 'Finances');
      const portfolioIndex = navItems.findIndex((e) => !isNavHeader(e) && e.href === '/portfolio');
      expect(financesIndex).toBeGreaterThanOrEqual(0);
      expect(financesIndex).toBeLessThan(portfolioIndex);
    });
  });

  describe('settingsItem', () => {
    it('should have correct structure and content', () => {
      expect(settingsItem).toBeDefined();
      expect(settingsItem.href).toBe('/settings');
      expect(settingsItem.label).toBe('Settings');
      expect(settingsItem.icon).toBe(Settings);
    });
  });

  describe('NavItem type export', () => {
    it('should be usable as a type', () => {
      const testItem: NavItem = {
        href: '/test',
        label: 'Test',
        icon: LayoutDashboard,
      };
      expect(testItem.href).toBe('/test');
      expect(testItem.label).toBe('Test');
    });
  });
});
