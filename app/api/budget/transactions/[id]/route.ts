import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateTransactionSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { transformTransaction } from '@/lib/api/transformers/budget';
import { Prisma } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/budget/transactions/[id]
 * Get a specific transaction
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const transaction = await prisma.budgetTransaction.findFirst({
      where: { id, householdId, isDeleted: false },
      include: {
        category: {
          select: { id: true, name: true },
        },
        payee: {
          select: { id: true, name: true },
        },
        profile: {
          select: { id: true, name: true },
        },
        tags: {
          include: {
            tag: {
              select: { id: true },
            },
          },
        },
        // Pending→settled twin merge audit — surfaces the soft-deleted twin
        // in the edit UI so a user who sees a "wrong" date/moneytorId can
        // see which row was collapsed. Bypasses the isDeleted filter on
        // purpose (that's exactly what makes it debug info).
        mergedFrom: {
          select: {
            id: true,
            transactionDate: true,
            amountIls: true,
            moneytorId: true,
            source: true,
            notes: true,
            categoryId: true,
            isDeleted: true,
          },
        },
        splitChildren: {
          where: { isDeleted: false },
          include: {
            category: {
              select: { id: true, name: true },
            },
            tags: {
              include: {
                tag: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const response = {
      ...transformTransaction(transaction),
      splitChildren: transaction.splitChildren.map((child) => ({
        ...transformTransaction({
          ...child,
          payee: null,
          profile: null,
        }),
      })),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budget/transactions/[id]
 * Update a transaction
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify transaction belongs to household and is not soft-deleted
    const existingTransaction = await prisma.budgetTransaction.findFirst({
      where: { id, householdId, isDeleted: false },
    });

    if (!existingTransaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateTransactionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify category belongs to household if provided
    if (data.categoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: data.categoryId, householdId },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    // Verify payee belongs to household if provided
    if (data.payeeId) {
      const payee = await prisma.budgetPayee.findFirst({
        where: { id: data.payeeId, householdId },
      });
      if (!payee) {
        return NextResponse.json({ success: false, error: 'Payee not found' }, { status: 404 });
      }
    }

    // Verify profile belongs to household if provided
    if (data.profileId) {
      const profileInHousehold = await prisma.householdMember.findFirst({
        where: { householdId, profileId: data.profileId },
      });
      if (!profileInHousehold) {
        return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
      }
    }

    // Verify tags belong to household
    if (data.tagIds && data.tagIds.length > 0) {
      const tags = await prisma.budgetTag.findMany({
        where: {
          id: { in: data.tagIds },
          householdId,
        },
      });
      if (tags.length !== data.tagIds.length) {
        return NextResponse.json(
          { success: false, error: 'One or more tags not found' },
          { status: 404 }
        );
      }
    }

    // Build update data (use UncheckedUpdateInput for direct scalar FK assignment,
    // avoiding connect/disconnect which is incompatible with Neon's poolQueryViaFetch)
    const updateData: Prisma.BudgetTransactionUncheckedUpdateInput = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.transactionDate !== undefined)
      updateData.transactionDate = new Date(data.transactionDate);
    if (data.paymentDate !== undefined)
      updateData.paymentDate = data.paymentDate ? new Date(data.paymentDate) : null;
    if (data.amountIls !== undefined) updateData.amountIls = data.amountIls;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.amountOriginal !== undefined) updateData.amountOriginal = data.amountOriginal;
    if (data.categoryId !== undefined) {
      updateData.categoryId = data.categoryId ?? null;
      // Assigning a category resolves any pending AI suggestion — clear it so
      // the "suggested" marker (yellow border) disappears.
      if (data.categoryId) {
        updateData.suggestedCategoryId = null;
        updateData.suggestionConfidence = null;
        updateData.suggestedAt = null;
      }
    }
    if (data.payeeId !== undefined) updateData.payeeId = data.payeeId ?? null;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.paymentNumber !== undefined) updateData.paymentNumber = data.paymentNumber;
    if (data.totalPayments !== undefined) updateData.totalPayments = data.totalPayments;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
    if (data.paymentIdentifier !== undefined) updateData.paymentIdentifier = data.paymentIdentifier;
    if (data.excludedFromFlow !== undefined) updateData.excludedFromFlow = data.excludedFromFlow;
    if (data.profileId !== undefined) updateData.profileId = data.profileId ?? null;

    // Update transaction
    await prisma.budgetTransaction.update({
      where: { id },
      data: updateData,
    });

    // Update tags if provided
    if (data.tagIds !== undefined) {
      // Delete existing tags individually (Neon poolQueryViaFetch compatibility)
      const existingTags = await prisma.budgetTransactionTag.findMany({
        where: { transactionId: id },
        select: { id: true },
      });
      for (const tag of existingTags) {
        await prisma.budgetTransactionTag.delete({
          where: { id: tag.id },
        });
      }

      // Create new tag links
      for (const tagId of data.tagIds) {
        await prisma.budgetTransactionTag.create({
          data: {
            transactionId: id,
            tagId,
          },
        });
      }
    }

    // Fetch updated transaction with relations
    const transaction = await prisma.budgetTransaction.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true },
        },
        suggestedCategory: {
          select: { id: true, name: true },
        },
        payee: {
          select: { id: true, name: true },
        },
        profile: {
          select: { id: true, name: true },
        },
        tags: {
          include: {
            tag: {
              select: { id: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: transformTransaction(transaction!),
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/transactions/[id]
 * Delete a transaction
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify transaction belongs to household and is not already deleted
    const existingTransaction = await prisma.budgetTransaction.findFirst({
      where: { id, householdId, isDeleted: false },
    });

    if (!existingTransaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    // Soft delete: mark as deleted (also soft-delete split children)
    // Note: Using individual update() calls instead of updateMany() due to
    // Neon poolQueryViaFetch compatibility (updateMany silently fails like createMany)
    await prisma.budgetTransaction.update({
      where: { id },
      data: { isDeleted: true },
    });

    // Soft-delete split children individually
    const splitChildren = await prisma.budgetTransaction.findMany({
      where: { originalTransactionId: id, householdId, isDeleted: false },
      select: { id: true },
    });
    for (const child of splitChildren) {
      await prisma.budgetTransaction.update({
        where: { id: child.id },
        data: { isDeleted: true },
      });
    }

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
