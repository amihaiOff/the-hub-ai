import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updatePayeeSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/budget/payees/[id]
 * Get a specific payee
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const payee = await prisma.budgetPayee.findFirst({
      where: { id, householdId },
      include: {
        category: {
          select: { id: true, name: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!payee) {
      return NextResponse.json({ success: false, error: 'Payee not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: payee.id,
        name: payee.name,
        categoryId: payee.categoryId,
        categoryName: payee.category?.name ?? null,
        neverDefault: payee.neverDefault,
        transactionCount: payee._count.transactions,
        householdId: payee.householdId,
        createdAt: payee.createdAt,
        updatedAt: payee.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching payee:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch payee' }, { status: 500 });
  }
}

/**
 * PUT /api/budget/payees/[id]
 * Update a payee
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify payee belongs to household
    const existingPayee = await prisma.budgetPayee.findFirst({
      where: { id, householdId },
    });

    if (!existingPayee) {
      return NextResponse.json({ success: false, error: 'Payee not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updatePayeeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, categoryId, recategorizeTransactions, neverDefault } = validation.data;

    // Setting neverDefault=true is exclusive with having a default category — clear it.
    const effectiveCategoryId =
      neverDefault === true ? null : categoryId !== undefined ? categoryId : undefined;

    // If a non-null effective categoryId was requested, verify it belongs to household
    if (effectiveCategoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: effectiveCategoryId, householdId },
      });

      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    const payeeUpdateData = {
      ...(name !== undefined && { name }),
      ...(effectiveCategoryId !== undefined && { categoryId: effectiveCategoryId }),
      ...(neverDefault !== undefined && { neverDefault }),
    };

    // Optionally re-categorize all transactions for this payee (atomically with payee update)
    let recategorizedCount = 0;
    const shouldRecategorize = recategorizeTransactions && effectiveCategoryId;

    if (shouldRecategorize) {
      // Sequential queries for Neon serverless compatibility (no $transaction)
      await prisma.budgetPayee.update({ where: { id }, data: payeeUpdateData });

      // Find and update non-deleted transactions for this payee in parallel batches
      const transactionsToUpdate = await prisma.budgetTransaction.findMany({
        where: { payeeId: id, householdId, isDeleted: false },
        select: { id: true },
      });

      const BATCH_SIZE = 5;
      for (let i = 0; i < transactionsToUpdate.length; i += BATCH_SIZE) {
        await Promise.all(
          transactionsToUpdate.slice(i, i + BATCH_SIZE).map((tx) =>
            prisma.budgetTransaction.update({
              where: { id: tx.id },
              data: { categoryId: effectiveCategoryId },
            })
          )
        );
      }

      recategorizedCount = transactionsToUpdate.length;
    } else {
      await prisma.budgetPayee.update({ where: { id }, data: payeeUpdateData });
    }

    const payee = await prisma.budgetPayee.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: payee!.id,
        name: payee!.name,
        categoryId: payee!.categoryId,
        categoryName: payee!.category?.name ?? null,
        neverDefault: payee!.neverDefault,
        transactionCount: payee!._count.transactions,
        householdId: payee!.householdId,
        createdAt: payee!.createdAt,
        updatedAt: payee!.updatedAt,
        recategorizedCount,
      },
    });
  } catch (error) {
    console.error('Error updating payee:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A payee with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: 'Failed to update payee' }, { status: 500 });
  }
}

/**
 * DELETE /api/budget/payees/[id]
 * Delete a payee (transactions become orphaned payee-wise via SetNull)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify payee belongs to household
    const existingPayee = await prisma.budgetPayee.findFirst({
      where: { id, householdId },
    });

    if (!existingPayee) {
      return NextResponse.json({ success: false, error: 'Payee not found' }, { status: 404 });
    }

    // Delete (transactions lose payee via SetNull)
    await prisma.budgetPayee.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting payee:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete payee' }, { status: 500 });
  }
}
