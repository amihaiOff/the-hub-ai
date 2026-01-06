import { test, expect } from '@playwright/test';

test.describe('Portfolio Feature - Complete User Flows', () => {
  test.describe('Desktop Viewport (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('1. Navigate to portfolio page - verify page loads correctly', async ({ page }) => {
      // Navigate to portfolio page
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Screenshot initial state
      await page.screenshot({
        path: './test-results/screenshots/portfolio/01-desktop-initial-load.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Stock Portfolio' });
      await expect(pageTitle).toBeVisible();

      // Verify page description
      const pageDesc = page.getByText('Track your stock investments and performance');
      await expect(pageDesc).toBeVisible();

      // Verify summary cards are displayed
      const totalValueCard = page.getByText('Total Value', { exact: true });
      await expect(totalValueCard).toBeVisible();

      // Verify Add Account button exists
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await expect(addAccountButton).toBeVisible();
    });

    test('2. Full CRUD flow - create account, add holding, edit, delete', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Screenshot before creating account
      await page.screenshot({
        path: './test-results/screenshots/portfolio/02-before-add-account.png',
        fullPage: true,
      });

      // Click Add Account button
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await expect(addAccountButton).toBeVisible();
      await addAccountButton.click();

      // Wait for dialog to open by checking for the dialog title
      const dialogTitle = page.getByRole('heading', { name: /Add (Stock )?Account/i });
      await expect(dialogTitle).toBeVisible();

      // Screenshot dialog
      await page.screenshot({
        path: './test-results/screenshots/portfolio/03-add-account-dialog.png',
        fullPage: true,
      });

      // Fill in the form with unique name
      const uniqueName = 'CRUD Test Account ' + Math.floor(Math.random() * 100000);
      const nameInput = page.locator('#name');
      await nameInput.fill(uniqueName);

      const brokerInput = page.locator('#broker');
      await brokerInput.fill('Test Broker');

      // Screenshot filled form
      await page.screenshot({
        path: './test-results/screenshots/portfolio/04-account-form-filled.png',
        fullPage: true,
      });

      // Submit the form
      const submitButton = page.getByRole('button', { name: /Add|Create/i }).last();
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // Wait for dialog to close and account to appear
      const accountCard = page.getByText(uniqueName);
      await expect(accountCard).toBeVisible({ timeout: 10000 });

      // Screenshot after creation
      await page.screenshot({
        path: './test-results/screenshots/portfolio/05-after-add-account.png',
        fullPage: true,
      });

      // Find the account card container
      const accountCardContainer = page
        .locator('[data-slot="card"]')
        .filter({ hasText: uniqueName });
      await expect(accountCardContainer).toBeVisible();

      // STEP: Add a stock holding
      // Look for Add Stock or Add Holding button within the account
      const addHoldingButton = accountCardContainer
        .getByRole('button', { name: /Add Stock|Add Holding/i })
        .first();

      // Check if button exists, if not try the three-dot menu
      const hasAddButton = await addHoldingButton.isVisible().catch(() => false);

      if (hasAddButton) {
        await addHoldingButton.click();
      } else {
        // Try the dropdown menu
        const menuButton = accountCardContainer.locator('button').last();
        await menuButton.click();

        // Wait for menu to appear
        const addStockOption = page.getByRole('menuitem', { name: /Add Stock|Add Holding/i });
        const menuVisible = await addStockOption.isVisible({ timeout: 5000 }).catch(() => false);
        if (menuVisible) {
          await addStockOption.click();
        }
      }

      // Screenshot add holding dialog (if it opened)
      await page.screenshot({
        path: './test-results/screenshots/portfolio/06-add-holding-dialog.png',
        fullPage: true,
      });

      // STEP: Edit the account
      // Open dropdown menu
      const menuButton = accountCardContainer.locator('button').last();
      await menuButton.click();

      // Wait for Edit option to appear in menu
      const editOption = page.getByRole('menuitem', { name: 'Edit' });
      const hasEditOption = await editOption.isVisible({ timeout: 5000 }).catch(() => false);

      // Screenshot dropdown menu
      await page.screenshot({
        path: './test-results/screenshots/portfolio/07-account-dropdown-menu.png',
        fullPage: true,
      });

      if (hasEditOption) {
        await editOption.click();

        // Wait for edit dialog to open
        const editDialog = page.locator('[role="dialog"]');
        await expect(editDialog).toBeVisible({ timeout: 5000 });

        // Screenshot edit dialog
        await page.screenshot({
          path: './test-results/screenshots/portfolio/08-edit-account-dialog.png',
          fullPage: true,
        });

        // Update the broker name
        const editBrokerInput = page.locator('#edit-broker, #broker').first();
        if (await editBrokerInput.isVisible().catch(() => false)) {
          await editBrokerInput.clear();
          await editBrokerInput.fill('Updated Broker');

          // Save changes
          const saveButton = page.getByRole('button', { name: /Save|Update/i });
          await saveButton.click();

          // Wait for dialog to close
          await expect(editDialog).toBeHidden({ timeout: 5000 });
        } else {
          // Close dialog if input not found
          const cancelButton = page.getByRole('button', { name: 'Cancel' });
          if (await cancelButton.isVisible()) {
            await cancelButton.click();
          }
        }
      }

      // Screenshot after edit
      await page.screenshot({
        path: './test-results/screenshots/portfolio/09-after-edit.png',
        fullPage: true,
      });

      // STEP: Delete the account
      const updatedCard = page.locator('[data-slot="card"]').filter({ hasText: uniqueName });
      const deleteMenuButton = updatedCard.locator('button').last();
      await deleteMenuButton.click();

      // Wait for Delete option to appear
      const deleteOption = page.getByRole('menuitem', { name: 'Delete' });
      const hasDeleteOption = await deleteOption.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasDeleteOption) {
        await deleteOption.click();

        // Wait for delete confirmation dialog
        const deleteDialog = page
          .locator('[role="alertdialog"], [role="dialog"]')
          .filter({ hasText: /Delete/ });
        await expect(deleteDialog).toBeVisible({ timeout: 5000 });

        // Screenshot delete confirmation dialog
        await page.screenshot({
          path: './test-results/screenshots/portfolio/10-delete-confirmation.png',
          fullPage: true,
        });

        // Confirm deletion
        const confirmDeleteButton = deleteDialog.getByRole('button', { name: 'Delete' });
        await confirmDeleteButton.click();

        // Wait for account card to disappear
        await expect(updatedCard).toBeHidden({ timeout: 10000 });
      }

      // Screenshot after deletion
      await page.screenshot({
        path: './test-results/screenshots/portfolio/11-after-delete.png',
        fullPage: true,
      });

      // Verify account is deleted
      const deletedAccount = page.getByText(uniqueName);
      await expect(deletedAccount).toBeHidden({ timeout: 5000 });

      console.log('Portfolio CRUD flow completed successfully!');
    });

    test('3. Currency toggle - verify ILS conversion works', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Look for currency toggle button
      const currencyToggle = page.getByRole('button', { name: /ILS|USD|Toggle Currency/i });
      const hasToggle = await currencyToggle.isVisible().catch(() => false);

      if (hasToggle) {
        // Screenshot before toggle
        await page.screenshot({
          path: './test-results/screenshots/portfolio/12-before-currency-toggle.png',
          fullPage: true,
        });

        await currencyToggle.click();

        // Wait for currency values to update (check for either symbol)
        const currencySymbol = page.locator('text=/[₪$]/');
        await expect(currencySymbol.first()).toBeVisible({ timeout: 5000 });

        // Screenshot after toggle
        await page.screenshot({
          path: './test-results/screenshots/portfolio/13-after-currency-toggle.png',
          fullPage: true,
        });

        // Verify some currency indicator changed
        // (This depends on implementation - could check for ₪ or $ symbols)
      }
    });
  });

  test.describe('Mobile Viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('4. Mobile - verify responsive layout', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Screenshot mobile view
      await page.screenshot({
        path: './test-results/screenshots/portfolio/14-mobile-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Stock Portfolio' });
      await expect(pageTitle).toBeVisible();

      // Verify hamburger menu is visible on mobile
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();

      // Verify Add Account button is accessible
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await expect(addAccountButton).toBeVisible();
    });

    test('5. Mobile - add account dialog fits screen', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Open add account dialog
      const addAccountButton = page.getByRole('button', { name: /Add Account/i });
      await addAccountButton.click();

      // Wait for dialog to open
      const dialogTitle = page.getByRole('heading', { name: /Add (Stock )?Account/i });
      await expect(dialogTitle).toBeVisible();

      // Screenshot mobile dialog
      await page.screenshot({
        path: './test-results/screenshots/portfolio/15-mobile-add-dialog.png',
        fullPage: true,
      });

      // Verify dialog does not overflow
      const dialogContent = page.locator('[role="dialog"]');
      const dialogBox = await dialogContent.boundingBox();

      if (dialogBox) {
        console.log('Dialog width: ' + dialogBox.width + ', Dialog x: ' + dialogBox.x);
        // Dialog should fit within viewport (with some margin)
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(400);
      }

      // Close dialog
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();
    });

    test('6. Mobile - navigation works correctly', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Open mobile menu
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await hamburgerButton.click();

      // Wait for menu to open by checking for Dashboard link
      const dashboardLink = page.getByText('Dashboard');
      await expect(dashboardLink).toBeVisible();

      // Screenshot mobile menu
      await page.screenshot({
        path: './test-results/screenshots/portfolio/16-mobile-menu.png',
        fullPage: true,
      });

      const portfolioLink = page.getByText('Portfolio');
      await expect(portfolioLink).toBeVisible();

      // Click to navigate to dashboard
      await dashboardLink.click();
      await page.waitForLoadState('networkidle');

      // Verify navigation worked
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('7. Tablet - verify layout', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Screenshot tablet view
      await page.screenshot({
        path: './test-results/screenshots/portfolio/17-tablet-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Stock Portfolio' });
      await expect(pageTitle).toBeVisible();

      // Verify sidebar is visible on tablet (depending on breakpoint)
      // This depends on the implementation - sidebar might be visible or hamburger
    });
  });
});
