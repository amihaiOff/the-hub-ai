import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation - Hamburger Menu', () => {
  test.describe('Mobile Viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('should display mobile header with hamburger menu on mobile viewport', async ({ page }) => {
      await page.goto('/');
      
      // Screenshot initial state
      await page.screenshot({ path: './test-results/screenshots/01-mobile-initial.png', fullPage: true });
      
      // Verify mobile header is visible
      const mobileHeader = page.locator('header').filter({ has: page.locator('button[aria-label="Open menu"]') });
      await expect(mobileHeader).toBeVisible();
      
      // Verify hamburger button is visible
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();
      
      // Verify logo is visible in header
      const logoText = page.locator('header').getByText('The Hub AI');
      await expect(logoText).toBeVisible();
    });

    test('should open menu when hamburger icon is clicked', async ({ page }) => {
      await page.goto('/');
      
      // Click hamburger button
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();
      
      // Wait for menu to be visible
      await page.waitForTimeout(300); // Allow animation
      
      // Screenshot menu open state
      await page.screenshot({ path: './test-results/screenshots/02-mobile-menu-open.png', fullPage: true });
      
      // Verify menu sheet is visible
      const menuSheet = page.locator('[role="dialog"]');
      await expect(menuSheet).toBeVisible();
      
      // Verify all 4 navigation items are present
      const dashboardLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Dashboard' });
      const portfolioLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Portfolio' });
      const pensionLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Pension' });
      const assetsLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Assets' });
      
      await expect(dashboardLink).toBeVisible();
      await expect(portfolioLink).toBeVisible();
      await expect(pensionLink).toBeVisible();
      await expect(assetsLink).toBeVisible();
    });

    test('should navigate and close menu when clicking a navigation link', async ({ page }) => {
      await page.goto('/');
      
      // Open menu
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();
      await page.waitForTimeout(300);
      
      // Click Portfolio link
      const portfolioLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Portfolio' });
      await portfolioLink.click();
      
      // Wait for navigation and animation
      await page.waitForURL('**/portfolio');
      await page.waitForTimeout(300);
      
      // Screenshot after navigation
      await page.screenshot({ path: './test-results/screenshots/03-mobile-after-nav.png', fullPage: true });
      
      // Verify menu is closed
      const menuSheet = page.locator('[role="dialog"]');
      await expect(menuSheet).not.toBeVisible();
      
      // Verify we're on portfolio page
      expect(page.url()).toContain('/portfolio');
    });

    test('should close menu when clicking the X button', async ({ page }) => {
      await page.goto('/');
      
      // Open menu
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();
      await page.waitForTimeout(300);
      
      // Verify menu is open
      const menuSheet = page.locator('[role="dialog"]');
      await expect(menuSheet).toBeVisible();
      
      // Click close button (X)
      const closeButton = page.locator('[role="dialog"]').locator('button').filter({ has: page.locator('svg.lucide-x') });
      if (await closeButton.count() > 0) {
        await closeButton.click();
      } else {
        // Alternative: press Escape key
        await page.keyboard.press('Escape');
      }
      
      await page.waitForTimeout(300);
      
      // Screenshot after close
      await page.screenshot({ path: './test-results/screenshots/04-mobile-menu-closed.png', fullPage: true });
      
      // Verify menu is closed
      await expect(menuSheet).not.toBeVisible();
    });

    test('should close menu when clicking outside (overlay)', async ({ page }) => {
      await page.goto('/');
      
      // Open menu
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();
      await page.waitForTimeout(300);
      
      // Verify menu is open
      const menuSheet = page.locator('[role="dialog"]');
      await expect(menuSheet).toBeVisible();
      
      // Click on overlay (outside menu content)
      // The Sheet overlay is usually a sibling or parent element
      await page.mouse.click(350, 400); // Click on right side where overlay is
      
      await page.waitForTimeout(300);
      
      // Screenshot after overlay click
      await page.screenshot({ path: './test-results/screenshots/05-mobile-overlay-close.png', fullPage: true });
      
      // Verify menu is closed
      await expect(menuSheet).not.toBeVisible();
    });

    test('should highlight active navigation item', async ({ page }) => {
      // Navigate to portfolio page
      await page.goto('/portfolio');
      
      // Open menu
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();
      await page.waitForTimeout(300);
      
      // Screenshot to verify active state
      await page.screenshot({ path: './test-results/screenshots/06-mobile-active-nav.png', fullPage: true });
      
      // Verify Portfolio link has aria-current="page"
      const portfolioLink = page.locator('[role="dialog"]').getByRole('link', { name: 'Portfolio' });
      await expect(portfolioLink).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('should still show hamburger menu on tablet viewport', async ({ page }) => {
      await page.goto('/');
      
      // Screenshot tablet view
      await page.screenshot({ path: './test-results/screenshots/07-tablet-initial.png', fullPage: true });
      
      // Hamburger should still be visible on tablet (under lg breakpoint)
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();
      
      // Open and verify menu works
      await hamburgerButton.click();
      await page.waitForTimeout(300);
      
      // Screenshot tablet menu
      await page.screenshot({ path: './test-results/screenshots/08-tablet-menu-open.png', fullPage: true });
      
      const menuSheet = page.locator('[role="dialog"]');
      await expect(menuSheet).toBeVisible();
    });
  });

  test.describe('Desktop Viewport (1024px+)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should show sidebar instead of hamburger menu on desktop', async ({ page }) => {
      await page.goto('/');
      
      // Screenshot desktop view
      await page.screenshot({ path: './test-results/screenshots/09-desktop-initial.png', fullPage: true });
      
      // Hamburger button should be hidden on desktop (lg:hidden)
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).not.toBeVisible();
      
      // Sidebar should be visible
      // The sidebar typically has navigation links visible directly
      const sidebarDashboard = page.locator('aside').getByRole('link', { name: 'Dashboard' });
      const sidebarPortfolio = page.locator('aside').getByRole('link', { name: 'Portfolio' });
      
      await expect(sidebarDashboard).toBeVisible();
      await expect(sidebarPortfolio).toBeVisible();
    });

    test('should navigate using sidebar on desktop', async ({ page }) => {
      await page.goto('/');
      
      // Click Portfolio in sidebar
      const sidebarPortfolio = page.locator('aside').getByRole('link', { name: 'Portfolio' });
      await sidebarPortfolio.click();
      
      await page.waitForURL('**/portfolio');
      
      // Screenshot after navigation
      await page.screenshot({ path: './test-results/screenshots/10-desktop-after-nav.png', fullPage: true });
      
      // Verify we're on portfolio page
      expect(page.url()).toContain('/portfolio');
    });
  });
});

test.describe('Mobile Menu Accessibility', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('should have proper ARIA attributes', async ({ page }) => {
    await page.goto('/');
    
    // Hamburger button should have aria-label
    const hamburgerButton = page.locator('button[aria-label="Open menu"]');
    await expect(hamburgerButton).toHaveAttribute('aria-label', 'Open menu');
    
    // Open menu
    await hamburgerButton.click();
    await page.waitForTimeout(300);
    
    // Menu should have role="dialog"
    const menuSheet = page.locator('[role="dialog"]');
    await expect(menuSheet).toBeVisible();
  });

  test('should be navigable with keyboard', async ({ page }) => {
    await page.goto('/');
    
    // Tab to hamburger button and press Enter
    await page.keyboard.press('Tab');
    // May need multiple tabs depending on DOM structure
    const hamburgerButton = page.locator('button[aria-label="Open menu"]');
    await hamburgerButton.focus();
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(300);
    
    // Verify menu opened
    const menuSheet = page.locator('[role="dialog"]');
    await expect(menuSheet).toBeVisible();
    
    // Press Escape to close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // Verify menu closed
    await expect(menuSheet).not.toBeVisible();
  });
});
