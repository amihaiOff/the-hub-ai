/**
 * Unit tests for navigation constants
 * Tests navItems structure and content
 */

import { navItems, NavItem } from '../navigation';
import { Home, TrendingUp, Building2, Wallet, Settings } from 'lucide-react';

describe('Navigation Constants', () => {
  describe('navItems array', () => {
    it('should contain exactly 5 navigation items', () => {
      expect(navItems).toHaveLength(5);
    });

    it('should be an array of NavItem objects', () => {
      expect(Array.isArray(navItems)).toBe(true);
      navItems.forEach((item) => {
        expect(item).toHaveProperty('href');
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('icon');
      });
    });
  });

  describe('NavItem structure', () => {
    it('should have href property as string for each item', () => {
      navItems.forEach((item) => {
        expect(typeof item.href).toBe('string');
        expect(item.href.length).toBeGreaterThan(0);
      });
    });

    it('should have label property as string for each item', () => {
      navItems.forEach((item) => {
        expect(typeof item.label).toBe('string');
        expect(item.label.length).toBeGreaterThan(0);
      });
    });

    it('should have icon property as a valid component for each item', () => {
      navItems.forEach((item) => {
        // LucideIcon components are ForwardRef objects with a $$typeof Symbol
        // They can be either objects (ForwardRef) or functions
        expect(item.icon).toBeDefined();
        expect(['function', 'object'].includes(typeof item.icon)).toBe(true);
      });
    });

    it('should have all hrefs starting with /', () => {
      navItems.forEach((item) => {
        expect(item.href).toMatch(/^\//);
      });
    });
  });

  describe('Dashboard navigation item', () => {
    let dashboardItem: NavItem | undefined;

    beforeEach(() => {
      dashboardItem = navItems.find((item) => item.label === 'Dashboard');
    });

    it('should exist', () => {
      expect(dashboardItem).toBeDefined();
    });

    it('should have href as "/"', () => {
      expect(dashboardItem?.href).toBe('/');
    });

    it('should have Home icon', () => {
      expect(dashboardItem?.icon).toBe(Home);
    });
  });

  describe('Portfolio navigation item', () => {
    let portfolioItem: NavItem | undefined;

    beforeEach(() => {
      portfolioItem = navItems.find((item) => item.label === 'Portfolio');
    });

    it('should exist', () => {
      expect(portfolioItem).toBeDefined();
    });

    it('should have href as "/portfolio"', () => {
      expect(portfolioItem?.href).toBe('/portfolio');
    });

    it('should have TrendingUp icon', () => {
      expect(portfolioItem?.icon).toBe(TrendingUp);
    });
  });

  describe('Pension navigation item', () => {
    let pensionItem: NavItem | undefined;

    beforeEach(() => {
      pensionItem = navItems.find((item) => item.label === 'Pension');
    });

    it('should exist', () => {
      expect(pensionItem).toBeDefined();
    });

    it('should have href as "/pension"', () => {
      expect(pensionItem?.href).toBe('/pension');
    });

    it('should have Building2 icon', () => {
      expect(pensionItem?.icon).toBe(Building2);
    });
  });

  describe('Assets navigation item', () => {
    let assetsItem: NavItem | undefined;

    beforeEach(() => {
      assetsItem = navItems.find((item) => item.label === 'Assets');
    });

    it('should exist', () => {
      expect(assetsItem).toBeDefined();
    });

    it('should have href as "/assets"', () => {
      expect(assetsItem?.href).toBe('/assets');
    });

    it('should have Wallet icon', () => {
      expect(assetsItem?.icon).toBe(Wallet);
    });
  });

  describe('Settings navigation item', () => {
    let settingsItem: NavItem | undefined;

    beforeEach(() => {
      settingsItem = navItems.find((item) => item.label === 'Settings');
    });

    it('should exist', () => {
      expect(settingsItem).toBeDefined();
    });

    it('should have href as "/settings"', () => {
      expect(settingsItem?.href).toBe('/settings');
    });

    it('should have Settings icon', () => {
      expect(settingsItem?.icon).toBe(Settings);
    });
  });

  describe('navItems order', () => {
    it('should have Dashboard as the first item', () => {
      expect(navItems[0].label).toBe('Dashboard');
    });

    it('should have Portfolio as the second item', () => {
      expect(navItems[1].label).toBe('Portfolio');
    });

    it('should have Pension as the third item', () => {
      expect(navItems[2].label).toBe('Pension');
    });

    it('should have Assets as the fourth item', () => {
      expect(navItems[3].label).toBe('Assets');
    });

    it('should have Settings as the fifth item', () => {
      expect(navItems[4].label).toBe('Settings');
    });
  });

  describe('Unique values', () => {
    it('should have unique hrefs', () => {
      const hrefs = navItems.map((item) => item.href);
      const uniqueHrefs = new Set(hrefs);
      expect(uniqueHrefs.size).toBe(hrefs.length);
    });

    it('should have unique labels', () => {
      const labels = navItems.map((item) => item.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it('should have unique icons', () => {
      const icons = navItems.map((item) => item.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
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
    });
  });
});
