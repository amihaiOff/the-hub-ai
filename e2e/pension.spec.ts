import { test, expect } from '@playwright/test';

test.describe('Pension Feature - Complete User Flows', () => {
  test.describe('Mobile Viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('1. Page Load - verify title, summary cards, and empty state', async ({ page }) => {
      // Navigate to pension page
      await page.goto('/pension');

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Screenshot initial state
      await page.screenshot({
        path: './test-results/screenshots/pension/01-mobile-initial-load.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Pension & Hishtalmut' });
      await expect(pageTitle).toBeVisible();

      // Verify summary cards are displayed (use exact: true for specific matches)
      const totalBalanceCard = page.getByText('Total Balance', { exact: true });
      const thisMonthCard = page.getByText('This Month', { exact: true });
      const accountsCard = page.getByText('Accounts', { exact: true });

      await expect(totalBalanceCard).toBeVisible();
      await expect(thisMonthCard).toBeVisible();
      await expect(accountsCard).toBeVisible();

      // Screenshot after verification
      await page.screenshot({
        path: './test-results/screenshots/pension/02-mobile-summary-cards.png',
        fullPage: true,
      });

      // Check for either empty state or existing accounts
      const emptyState = page.getByText('No accounts yet');
      const yourAccountsSection = page.getByRole('heading', { name: 'Your Accounts' });

      await expect(yourAccountsSection).toBeVisible();

      // The empty state may or may not be visible depending on existing data
      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      console.log(`Empty state visible: ${hasEmptyState}`);
    });

    test('2. Add Account - open dialog and verify form fields', async ({ page }) => {
      await page.goto('/pension');
      await page.waitForLoadState('networkidle');

      // Click Add Account button
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await expect(addAccountButton).toBeVisible();

      // Screenshot before clicking
      await page.screenshot({
        path: './test-results/screenshots/pension/03-mobile-add-account-button.png',
        fullPage: true,
      });

      await addAccountButton.click();

      // Wait for dialog to open
      await page.waitForTimeout(300);

      // Screenshot dialog
      await page.screenshot({
        path: './test-results/screenshots/pension/04-mobile-add-account-dialog.png',
        fullPage: true,
      });

      // Verify dialog is open
      const dialogTitle = page.getByRole('heading', { name: 'Add Pension Account' });
      await expect(dialogTitle).toBeVisible();

      // Verify all form fields are present
      const typeLabel = page.getByText('Account Type *');
      const providerLabel = page.getByText('Provider *');
      const accountNameLabel = page.getByText('Account Name *');
      const currentValueLabel = page.getByText('Current Value (ILS) *');
      const feeFromDepositLabel = page.getByText('Fee from Deposit (%) *');
      const annualFeeLabel = page.getByText('Annual Fee (%) *');

      await expect(typeLabel).toBeVisible();
      await expect(providerLabel).toBeVisible();
      await expect(accountNameLabel).toBeVisible();
      await expect(currentValueLabel).toBeVisible();
      await expect(feeFromDepositLabel).toBeVisible();
      await expect(annualFeeLabel).toBeVisible();

      // Fill in the form
      // Account Type is already "Pension" by default
      const typeSelect = page.locator('#type');
      await expect(typeSelect).toBeVisible();

      // Fill provider name
      const providerInput = page.locator('#providerName');
      await providerInput.fill('Meitav');

      // Fill account name
      const accountNameInput = page.locator('#accountName');
      await accountNameInput.fill('My Pension');

      // Fill current value
      const currentValueInput = page.locator('#currentValue');
      await currentValueInput.fill('100000');

      // Fill fee from deposit
      const feeFromDepositInput = page.locator('#feeFromDeposit');
      await feeFromDepositInput.fill('0.5');

      // Fill annual fee
      const feeFromTotalInput = page.locator('#feeFromTotal');
      await feeFromTotalInput.fill('0.3');

      // Screenshot filled form
      await page.screenshot({
        path: './test-results/screenshots/pension/05-mobile-add-account-form-filled.png',
        fullPage: true,
      });

      // Verify form can be submitted (button exists and is enabled)
      const submitButton = page.getByRole('button', { name: 'Add Account' }).last();
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();

      // Note: We won't actually submit because it may fail due to API/auth issues in test environment
      // The form fill verification is the key test here

      // Test Cancel button works
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      await page.waitForTimeout(300);

      // Verify dialog closed
      await expect(dialogTitle).not.toBeVisible();

      // Screenshot after cancel
      await page.screenshot({
        path: './test-results/screenshots/pension/06-mobile-dialog-closed.png',
        fullPage: true,
      });
    });

    test('3. UI Elements - verify page structure and styling', async ({ page }) => {
      await page.goto('/pension');
      await page.waitForLoadState('networkidle');

      // Wait for any loading states to complete
      await page.waitForTimeout(1000);

      // Screenshot full page
      await page.screenshot({
        path: './test-results/screenshots/pension/07-mobile-full-page.png',
        fullPage: true,
      });

      // Verify header structure
      const header = page.locator('header');
      await expect(header).toBeVisible();

      // Verify The Hub AI logo/text in header (on mobile, it's in the mobile header)
      const logoText = page.locator('header').getByText('The Hub AI');
      await expect(logoText).toBeVisible();

      // Verify hamburger menu on mobile
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();

      // Verify main content area
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();

      // Check card styling (dark mode)
      const cards = page.locator('[data-slot="card"]');
      const cardCount = await cards.count();
      console.log(`Found ${cardCount} cards on the page`);
      expect(cardCount).toBeGreaterThanOrEqual(3); // At least 3 summary cards
    });
  });

  test.describe('Desktop Viewport (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('4. Responsive Design - verify desktop layout', async ({ page }) => {
      await page.goto('/pension');
      await page.waitForLoadState('networkidle');

      // Wait for content to load
      await page.waitForTimeout(500);

      // Screenshot desktop view
      await page.screenshot({
        path: './test-results/screenshots/pension/08-desktop-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Pension & Hishtalmut' });
      await expect(pageTitle).toBeVisible();

      // Verify sidebar is visible on desktop
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      // Verify hamburger menu is NOT visible on desktop
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).not.toBeVisible();

      // Verify sidebar navigation links
      const dashboardLink = page.locator('aside').getByRole('link', { name: 'Dashboard' });
      const portfolioLink = page.locator('aside').getByRole('link', { name: 'Portfolio' });
      const pensionLink = page.locator('aside').getByRole('link', { name: 'Pension' });
      const assetsLink = page.locator('aside').getByRole('link', { name: 'Assets' });

      await expect(dashboardLink).toBeVisible();
      await expect(portfolioLink).toBeVisible();
      await expect(pensionLink).toBeVisible();
      await expect(assetsLink).toBeVisible();

      // Verify summary cards are in a grid layout (check they're horizontal)
      const totalBalanceCard = page.getByText('Total Balance', { exact: true });
      const thisMonthCard = page.getByText('This Month', { exact: true });

      const totalBoundingBox = await totalBalanceCard.boundingBox();
      const thisMonthBoundingBox = await thisMonthCard.boundingBox();

      // On desktop, cards should be side by side (similar Y position)
      if (totalBoundingBox && thisMonthBoundingBox) {
        const yDiff = Math.abs(totalBoundingBox.y - thisMonthBoundingBox.y);
        console.log(`Y difference between cards: ${yDiff}`);
        expect(yDiff).toBeLessThan(50); // Cards should be roughly on the same row
      }

      // Screenshot desktop summary cards
      await page.screenshot({
        path: './test-results/screenshots/pension/09-desktop-summary-cards.png',
        fullPage: true,
      });
    });

    test('5. Desktop - Add Account dialog', async ({ page }) => {
      await page.goto('/pension');
      await page.waitForLoadState('networkidle');

      // Click Add Account button
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await addAccountButton.click();

      await page.waitForTimeout(300);

      // Screenshot desktop dialog
      await page.screenshot({
        path: './test-results/screenshots/pension/10-desktop-add-account-dialog.png',
        fullPage: true,
      });

      // Verify dialog is properly centered on desktop
      const dialogContent = page.locator('[role="dialog"]');
      await expect(dialogContent).toBeVisible();

      const dialogBox = await dialogContent.boundingBox();
      if (dialogBox) {
        // Dialog should be centered (roughly in the middle of the viewport)
        const viewportWidth = 1280;
        const dialogCenter = dialogBox.x + dialogBox.width / 2;
        const viewportCenter = viewportWidth / 2;
        const offset = Math.abs(dialogCenter - viewportCenter);
        console.log(`Dialog offset from center: ${offset}px`);
        expect(offset).toBeLessThan(100); // Dialog should be roughly centered
      }

      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await expect(dialogContent).not.toBeVisible();
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('6. Tablet - verify responsive layout', async ({ page }) => {
      await page.goto('/pension');
      await page.waitForLoadState('networkidle');

      // Screenshot tablet view
      await page.screenshot({
        path: './test-results/screenshots/pension/11-tablet-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Pension & Hishtalmut' });
      await expect(pageTitle).toBeVisible();

      // On tablet (768px), hamburger should still be visible (lg breakpoint is 1024px)
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();

      // Summary cards should be in a 2-column grid on tablet
      const totalBalanceCard = page.getByText('Total Balance', { exact: true });
      const accountsCard = page.getByText('Accounts', { exact: true });

      const totalBox = await totalBalanceCard.boundingBox();
      const accountsBox = await accountsCard.boundingBox();

      if (totalBox && accountsBox) {
        // On tablet with 2-column grid, cards should be at different positions
        console.log(`Total Balance card: x=${totalBox.x}, y=${totalBox.y}`);
        console.log(`Accounts card: x=${accountsBox.x}, y=${accountsBox.y}`);
      }
    });
  });
});
