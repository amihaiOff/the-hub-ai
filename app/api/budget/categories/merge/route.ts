import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { mergeCategoriesSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * PUT /api/budget/categories/merge
 * Merge source category into target category.
 * Moves all transactions, payees, rules, and Riseup mappings.
 * Adds source budget to target budget. Deletes source category.
 */
export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const validation = mergeCategoriesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { sourceCategoryId, targetCategoryId } = validation.data;

    // Verify both categories exist and belong to household
    const [sourceCategory, targetCategory] = await Promise.all([
      prisma.budgetCategory.findFirst({
        where: { id: sourceCategoryId, householdId },
      }),
      prisma.budgetCategory.findFirst({
        where: { id: targetCategoryId, householdId },
      }),
    ]);

    if (!sourceCategory) {
      return NextResponse.json(
        { success: false, error: 'Source category not found' },
        { status: 404 }
      );
    }
    if (!targetCategory) {
      return NextResponse.json(
        { success: false, error: 'Target category not found' },
        { status: 404 }
      );
    }

    // Merge budgets: add source budget to target budget (null treated as 0)
    const sourceBudget = Number(sourceCategory.budget ?? 0);
    const targetBudget = Number(targetCategory.budget ?? 0);
    const combinedBudget = sourceBudget + targetBudget;

    // All operations in a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Move all transactions from source to target
      const txResult = await tx.budgetTransaction.updateMany({
        where: { categoryId: sourceCategoryId, householdId },
        data: { categoryId: targetCategoryId },
      });

      // 2. Update payees with source as default category
      const payeeResult = await tx.budgetPayee.updateMany({
        where: { categoryId: sourceCategoryId, householdId },
        data: { categoryId: targetCategoryId },
      });

      // 3. Update payee rules targeting source category
      await tx.payeeCategoryRule.updateMany({
        where: { categoryId: sourceCategoryId, householdId },
        data: { categoryId: targetCategoryId },
      });

      // 4. Update Riseup category mappings
      await tx.riseupCategory.updateMany({
        where: { budgetCategoryId: sourceCategoryId, householdId },
        data: { budgetCategoryId: targetCategoryId },
      });

      // 5. Merge budgets
      if (combinedBudget > 0) {
        await tx.budgetCategory.update({
          where: { id: targetCategoryId },
          data: { budget: combinedBudget },
        });
      }

      // 6. Delete source category
      await tx.budgetCategory.delete({
        where: { id: sourceCategoryId },
      });

      return { transactionsMoved: txResult.count, payeesUpdated: payeeResult.count };
    });

    return NextResponse.json({
      success: true,
      data: {
        targetCategoryId,
        ...result,
      },
    });
  } catch (error) {
    console.error('Error merging categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to merge categories' },
      { status: 500 }
    );
  }
}
