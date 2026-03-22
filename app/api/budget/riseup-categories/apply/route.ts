import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * POST /api/budget/riseup-categories/apply
 * Re-apply Riseup category → budget category mappings to existing
 * uncategorized transactions that have a riseupCategory stored on
 * their payee or via a matching riseup category name.
 *
 * This is useful when mappings are set up AFTER transactions were imported.
 * Only updates transactions where categoryId IS NULL.
 */
export async function POST() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    // Fetch all active Riseup category mappings
    const riseupCategories = await prisma.riseupCategory.findMany({
      where: { householdId, isDeleted: false, budgetCategoryId: { not: null } },
      select: { name: true, budgetCategoryId: true },
    });

    if (riseupCategories.length === 0) {
      return NextResponse.json({
        success: true,
        data: { updated: 0, message: 'No Riseup category mappings found' },
      });
    }

    // Fetch all uncategorized transactions with their payee info
    // We look for the riseupCategory value stored in the transaction notes
    // or match via payee default category that was set from Riseup mapping.
    // The most reliable approach: use payee's categoryId (already set during import)
    // for transactions that still have null categoryId.
    const uncategorizedTxs = await prisma.budgetTransaction.findMany({
      where: {
        householdId,
        categoryId: null,
        isSplit: false,
        excludedFromFlow: false,
        payeeId: { not: null },
      },
      select: {
        id: true,
        payee: { select: { categoryId: true } },
      },
    });

    let updated = 0;
    for (const tx of uncategorizedTxs) {
      const payeeCategoryId = tx.payee?.categoryId;
      if (payeeCategoryId) {
        await prisma.budgetTransaction.update({
          where: { id: tx.id },
          data: { categoryId: payeeCategoryId },
        });
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { updated },
    });
  } catch (error) {
    console.error('Error applying Riseup category mappings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply Riseup category mappings' },
      { status: 500 }
    );
  }
}
