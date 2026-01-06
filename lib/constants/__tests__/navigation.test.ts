/**
 * Unit tests for navigation constants
 * Tests navItems structure and content
 *
 * Consolidated from ~30 tests to ~10 tests for maintainability
 */

import { navItems, settingsItem, NavItem } from '../navigation';
import { Home, TrendingUp, Building2, Wallet, Settings } from 'lucide-react';

describe('Navigation Constants', () => {
  describe('navItems array structure', () => {
    it('should contain exactly 4 navigation items with valid structure', () => {
      expect(navItems).toHaveLength(4);
      expect(Array.isArray(navItems)).toBe(true);

      navItems.forEach((item) => {
        expect(item).toHaveProperty('href');
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('icon');
        expect(typeof item.href).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(item.href.length).toBeGreaterThan(0);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.href).toMatch(/^\//);
        // LucideIcon components are ForwardRef objects or functions
        expect(['function', 'object'].includes(typeof item.icon)).toBe(true);
      });
    });

    it('should have unique hrefs, labels, and icons', () => {
      const hrefs = navItems.map((item) => item.href);
      const labels = navItems.map((item) => item.label);
      const icons = navItems.map((item) => item.icon);

      expect(new Set(hrefs).size).toBe(hrefs.length);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(icons).size).toBe(icons.length);
    });
  });

  describe('navItems content and order', () => {
    const expectedItems = [
      { label: 'Dashboard', href: '/', icon: Home },
      { label: 'Portfolio', href: '/portfolio', icon: TrendingUp },
      { label: 'Pension', href: '/pension', icon: Building2 },
      { label: 'Assets', href: '/assets', icon: Wallet },
    ];

    it.each(expectedItems.map((item, index) => [index, item.label, item.href, item.icon]))(
      'should have %s at position %i with href "%s"',
      (index, label, href, icon) => {
        const item = navItems[index as number];
        expect(item.label).toBe(label);
        expect(item.href).toBe(href);
        expect(item.icon).toBe(icon);
      }
    );
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
      // Type check - this would fail at compile time if NavItem wasn't exported correctly
      const testItem: NavItem = {
        href: '/test',
        label: 'Test',
        icon: Home,
      };
      expect(testItem.href).toBe('/test');
      expect(testItem.label).toBe('Test');
    });
  });
});
