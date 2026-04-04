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

    // Perform merge operations with batched parallel updates
    // Note: $transaction doesn't work on Neon HTTP adapter, and updateMany silently fails.
    // Using individual update() calls in parallel batches instead.
    const BATCH_SIZE = 5;

    // 1. Move all transactions from source to target
    const txsToMove = await prisma.budgetTransaction.findMany({
      where: { categoryId: sourceCategoryId, householdId },
      select: { id: true },
    });
    for (let i = 0; i < txsToMove.length; i += BATCH_SIZE) {
      await Promise.all(
        txsToMove.slice(i, i + BATCH_SIZE).map((t) =>
          prisma.budgetTransaction.update({
            where: { id: t.id },
            data: { categoryId: targetCategoryId },
          })
        )
      );
    }

    // 2. Update payees with source as default category
    const payeesToMove = await prisma.budgetPayee.findMany({
      where: { categoryId: sourceCategoryId, householdId },
      select: { id: true },
    });
    for (let i = 0; i < payeesToMove.length; i += BATCH_SIZE) {
      await Promise.all(
        payeesToMove.slice(i, i + BATCH_SIZE).map((p) =>
          prisma.budgetPayee.update({
            where: { id: p.id },
            data: { categoryId: targetCategoryId },
          })
        )
      );
    }

    // 3. Update payee rules targeting source category
    const rulesToMove = await prisma.payeeCategoryRule.findMany({
      where: { categoryId: sourceCategoryId, householdId },
      select: { id: true },
    });
    for (let i = 0; i < rulesToMove.length; i += BATCH_SIZE) {
      await Promise.all(
        rulesToMove.slice(i, i + BATCH_SIZE).map((r) =>
          prisma.payeeCategoryRule.update({
            where: { id: r.id },
            data: { categoryId: targetCategoryId },
          })
        )
      );
    }

    // 4. Update Riseup category mappings
    const riseupToMove = await prisma.riseupCategory.findMany({
      where: { budgetCategoryId: sourceCategoryId, householdId },
      select: { id: true },
    });
    for (let i = 0; i < riseupToMove.length; i += BATCH_SIZE) {
      await Promise.all(
        riseupToMove.slice(i, i + BATCH_SIZE).map((rc) =>
          prisma.riseupCategory.update({
            where: { id: rc.id },
            data: { budgetCategoryId: targetCategoryId },
          })
        )
      );
    }

    // 5. Merge budgets
    if (combinedBudget > 0) {
      await prisma.budgetCategory.update({
        where: { id: targetCategoryId },
        data: { budget: combinedBudget },
      });
    }

    // 6. Delete source category
    await prisma.budgetCategory.delete({
      where: { id: sourceCategoryId },
    });

    const result = { transactionsMoved: txsToMove.length, payeesUpdated: payeesToMove.length };

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
