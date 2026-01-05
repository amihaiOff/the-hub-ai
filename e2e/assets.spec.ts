import { test, expect } from '@playwright/test';

test.describe('Assets Feature - Complete User Flows', () => {
  test.describe('Desktop Viewport (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('1. Navigate to assets page - verify page loads correctly', async ({ page }) => {
      // Navigate to assets page
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Screenshot initial state
      await page.screenshot({
        path: './test-results/screenshots/assets/01-desktop-initial-load.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Misc Assets & Debt' });
      await expect(pageTitle).toBeVisible();

      // Verify page description
      const pageDesc = page.getByText('Track bank deposits, loans, mortgages, and savings');
      await expect(pageDesc).toBeVisible();

      // Verify summary cards are displayed
      const totalAssetsCard = page.getByText('Total Assets', { exact: true });
      const totalLiabilitiesCard = page.getByText('Total Liabilities', { exact: true });
      const netValueCard = page.getByText('Net Value', { exact: true });

      await expect(totalAssetsCard).toBeVisible();
      await expect(totalLiabilitiesCard).toBeVisible();
      await expect(netValueCard).toBeVisible();

      // Verify section heading
      const sectionHeading = page.getByRole('heading', { name: 'Your Assets & Liabilities' });
      await expect(sectionHeading).toBeVisible();

      // Check for either empty state or existing assets
      const emptyState = page.getByText('No assets or liabilities yet');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      console.log('Empty state visible: ' + hasEmptyState);
    });

    test('2. Full CRUD flow - create, verify, edit, delete bank deposit', async ({ page }) => {
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Screenshot before creating asset
      await page.screenshot({
        path: './test-results/screenshots/assets/02-before-add-asset.png',
        fullPage: true,
      });

      // Click Add Asset button
      const addAssetButton = page.getByRole('button', { name: /Add Asset/i });
      await expect(addAssetButton).toBeVisible();
      await addAssetButton.click();

      // Wait for dialog to open
      await page.waitForTimeout(300);

      // Screenshot dialog
      await page.screenshot({
        path: './test-results/screenshots/assets/03-add-asset-dialog.png',
        fullPage: true,
      });

      // Verify dialog is open
      const dialogTitle = page.getByRole('heading', { name: /Add Asset/i });
      await expect(dialogTitle).toBeVisible();

      // Verify form fields are present
      const typeLabel = page.getByText('Type *');
      const nameLabel = page.getByText('Name *');
      const currentValueLabel = page.getByText('Current Value (ILS) *');
      const interestRateLabel = page.getByText('Interest Rate (%) *');

      await expect(typeLabel).toBeVisible();
      await expect(nameLabel).toBeVisible();
      await expect(currentValueLabel).toBeVisible();
      await expect(interestRateLabel).toBeVisible();

      // Type selector should already show Bank Deposit by default
      const typeSelector = page.locator('#type');
      await expect(typeSelector).toBeVisible();

      // Fill in the form with unique name to avoid conflicts
      const uniqueName = 'CRUD Test ' + Math.floor(Math.random() * 100000);
      const nameInput = page.locator('#name');
      await nameInput.fill(uniqueName);

      const currentValueInput = page.locator('#currentValue');
      await currentValueInput.fill('10000');

      const interestRateInput = page.locator('#interestRate');
      await interestRateInput.fill('4.25');

      // Set maturity date - click to open date picker
      const maturityDateButton = page.locator('#maturityDate');
      if (await maturityDateButton.isVisible()) {
        await maturityDateButton.click();
        await page.waitForTimeout(300);

        // Navigate to next month and select a date
        const nextMonthButton = page.locator('button[name="next-month"]');
        if (await nextMonthButton.isVisible()) {
          await nextMonthButton.click();
          await page.waitForTimeout(200);
        }

        // Click on day 15
        const day15 = page.getByRole('gridcell', { name: '15' }).first();
        if (await day15.isVisible()) {
          await day15.click();
          await page.waitForTimeout(200);
        }
      }

      // Screenshot filled form
      await page.screenshot({
        path: './test-results/screenshots/assets/04-form-filled.png',
        fullPage: true,
      });

      // Submit the form
      const submitButton = page.getByRole('button', { name: 'Add' });
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // Wait for API response and dialog to close
      await page.waitForTimeout(1000);

      // Screenshot after creation
      await page.screenshot({
        path: './test-results/screenshots/assets/05-after-add-asset.png',
        fullPage: true,
      });

      // STEP 3: Verify the asset appears in the list
      const assetCard = page.getByText(uniqueName);
      await expect(assetCard).toBeVisible();

      // Verify the value is displayed within this specific card
      const assetCardContainer = page.locator('[data-slot="card"]').filter({ hasText: uniqueName });
      await expect(assetCardContainer).toBeVisible();

      // Verify the card contains 10,000
      await expect(assetCardContainer.locator('text=/10,000/')).toBeVisible();

      // Verify interest rate is shown within this card (4.25 becomes 4.25% APR)
      await expect(assetCardContainer.getByText('4.25% APR')).toBeVisible();

      // Screenshot after verification
      await page.screenshot({
        path: './test-results/screenshots/assets/06-asset-verified.png',
        fullPage: true,
      });

      // STEP 5: Edit the asset - change value to 15000
      // Find the dropdown menu button in this specific card
      const menuButton = assetCardContainer.locator('button').last();
      await menuButton.click();

      await page.waitForTimeout(300);

      // Screenshot dropdown menu
      await page.screenshot({
        path: './test-results/screenshots/assets/07-dropdown-menu.png',
        fullPage: true,
      });

      // Click Edit option
      const editOption = page.getByRole('menuitem', { name: 'Edit' });
      await expect(editOption).toBeVisible();
      await editOption.click();

      await page.waitForTimeout(300);

      // Screenshot edit dialog
      await page.screenshot({
        path: './test-results/screenshots/assets/08-edit-dialog.png',
        fullPage: true,
      });

      // Verify edit dialog is open
      const editDialogTitle = page.getByRole('heading', { name: /Edit Bank Deposit/i });
      await expect(editDialogTitle).toBeVisible();

      // Clear and update the value
      const editValueInput = page.locator('#edit-currentValue');
      await editValueInput.clear();
      await editValueInput.fill('15000');

      // Screenshot edited form
      await page.screenshot({
        path: './test-results/screenshots/assets/09-edit-form-filled.png',
        fullPage: true,
      });

      // Save changes
      const saveButton = page.getByRole('button', { name: 'Save Changes' });
      await saveButton.click();

      await page.waitForTimeout(1000);

      // STEP 6: Verify the change is reflected
      await page.screenshot({
        path: './test-results/screenshots/assets/10-after-edit.png',
        fullPage: true,
      });

      // Verify updated value appears in the card
      const updatedCard = page.locator('[data-slot="card"]').filter({ hasText: uniqueName });
      await expect(updatedCard.locator('text=/15,000/')).toBeVisible();

      // STEP 7: Delete the asset
      // Open dropdown menu again
      const deleteMenuButton = updatedCard.locator('button').last();
      await deleteMenuButton.click();

      await page.waitForTimeout(300);

      // Click Delete option
      const deleteOption = page.getByRole('menuitem', { name: 'Delete' });
      await expect(deleteOption).toBeVisible();
      await deleteOption.click();

      await page.waitForTimeout(300);

      // Screenshot delete confirmation dialog
      await page.screenshot({
        path: './test-results/screenshots/assets/11-delete-confirmation.png',
        fullPage: true,
      });

      // Verify delete confirmation dialog
      const deleteDialog = page
        .locator('[role="alertdialog"], [role="dialog"]')
        .filter({ hasText: /Delete/ });
      await expect(deleteDialog).toBeVisible();

      // Confirm deletion
      const confirmDeleteButton = deleteDialog.getByRole('button', { name: 'Delete' });
      await confirmDeleteButton.click();

      await page.waitForTimeout(1000);

      // STEP 8: Verify asset is deleted
      await page.screenshot({
        path: './test-results/screenshots/assets/12-after-delete.png',
        fullPage: true,
      });

      // Check if asset is gone
      const deletedAsset = page.getByText(uniqueName);
      const assetStillVisible = await deletedAsset.isVisible().catch(() => false);
      expect(assetStillVisible).toBe(false);

      console.log('CRUD flow completed successfully!');
    });

    test('3. Form Validation - verify required fields', async ({ page }) => {
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Open add dialog
      const addAssetButton = page.getByRole('button', { name: /Add Asset/i });
      await addAssetButton.click();
      await page.waitForTimeout(300);

      // Try to submit empty form
      const submitButton = page.getByRole('button', { name: 'Add' });
      await submitButton.click();

      await page.waitForTimeout(300);

      // Screenshot validation errors
      await page.screenshot({
        path: './test-results/screenshots/assets/13-validation-errors.png',
        fullPage: true,
      });

      // Verify error message appears
      const errorAlert = page.locator('[role="alert"]');
      await expect(errorAlert).toBeVisible();

      // Close dialog
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();
    });
  });

  test.describe('Mobile Viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('4. Mobile - verify responsive layout', async ({ page }) => {
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Screenshot mobile view
      await page.screenshot({
        path: './test-results/screenshots/assets/14-mobile-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Misc Assets & Debt' });
      await expect(pageTitle).toBeVisible();

      // Verify hamburger menu is visible on mobile
      const hamburgerButton = page.locator('button[aria-label="Open menu"]');
      await expect(hamburgerButton).toBeVisible();

      // Verify summary cards are stacked (single column)
      const totalAssetsCard = page.getByText('Total Assets', { exact: true });
      const totalLiabilitiesCard = page.getByText('Total Liabilities', { exact: true });

      const totalBox = await totalAssetsCard.boundingBox();
      const liabilitiesBox = await totalLiabilitiesCard.boundingBox();

      if (totalBox && liabilitiesBox) {
        // On mobile, cards should be stacked (different Y positions)
        const yDiff = Math.abs(totalBox.y - liabilitiesBox.y);
        console.log('Y difference between cards on mobile: ' + yDiff);
        // Cards should be at different Y positions (stacked)
        expect(yDiff).toBeGreaterThan(100);
      }
    });

    test('5. Mobile - add asset dialog fits screen', async ({ page }) => {
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Open add dialog
      const addAssetButton = page.getByRole('button', { name: /Add Asset/i });
      await addAssetButton.click();
      await page.waitForTimeout(300);

      // Screenshot mobile dialog
      await page.screenshot({
        path: './test-results/screenshots/assets/15-mobile-add-dialog.png',
        fullPage: true,
      });

      // Verify dialog content is visible
      const dialogTitle = page.getByRole('heading', { name: /Add Asset/i });
      await expect(dialogTitle).toBeVisible();

      // Verify dialog does not overflow
      const dialogContent = page.locator('[role="dialog"]');
      const dialogBox = await dialogContent.boundingBox();

      if (dialogBox) {
        console.log('Dialog width: ' + dialogBox.width + ', Dialog x: ' + dialogBox.x);
        // Dialog should fit within viewport (with some margin for padding)
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(400);
      }

      // Close dialog
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('6. Tablet - verify 2-column grid layout', async ({ page }) => {
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');

      // Screenshot tablet view
      await page.screenshot({
        path: './test-results/screenshots/assets/16-tablet-view.png',
        fullPage: true,
      });

      // Verify page title
      const pageTitle = page.getByRole('heading', { name: 'Misc Assets & Debt' });
      await expect(pageTitle).toBeVisible();

      // On tablet (768px), summary cards should be in 2-column grid
      const totalAssetsCard = page.getByText('Total Assets', { exact: true });
      const totalLiabilitiesCard = page.getByText('Total Liabilities', { exact: true });

      const totalBox = await totalAssetsCard.boundingBox();
      const liabilitiesBox = await totalLiabilitiesCard.boundingBox();

      if (totalBox && liabilitiesBox) {
        console.log('Tablet - Total Assets: x=' + totalBox.x + ', y=' + totalBox.y);
        console.log('Tablet - Liabilities: x=' + liabilitiesBox.x + ', y=' + liabilitiesBox.y);
        // On tablet with 2-column grid, cards should be side by side
        const yDiff = Math.abs(totalBox.y - liabilitiesBox.y);
        expect(yDiff).toBeLessThan(50); // Should be on same row
      }
    });
  });
});
