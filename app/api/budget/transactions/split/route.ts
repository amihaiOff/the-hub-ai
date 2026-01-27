import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createSplitSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { Prisma } from '@prisma/client';

/**
 * POST /api/budget/transactions/split
 * Split a transaction into multiple transactions
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createSplitSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { originalTransactionId, splits } = validation.data;

    // Verify original transaction belongs to household
    const originalTransaction = await prisma.budgetTransaction.findFirst({
      where: { id: originalTransactionId, householdId },
    });

    if (!originalTransaction) {
      return NextResponse.json(
        { success: false, error: 'Original transaction not found' },
        { status: 404 }
      );
    }

    // Check if transaction is already split
    if (originalTransaction.isSplit) {
      return NextResponse.json(
        { success: false, error: 'Transaction is already split' },
        { status: 400 }
      );
    }

    // Verify split amounts sum to original amount using Decimal for financial precision
    const totalSplitAmount = splits.reduce(
      (sum, s) => sum.add(new Prisma.Decimal(s.amountIls)),
      new Prisma.Decimal(0)
    );
    const originalAmount = originalTransaction.amountIls;

    // Compare using Decimal arithmetic for financial precision
    if (!totalSplitAmount.equals(originalAmount)) {
      return NextResponse.json(
        {
          success: false,
          error: `Split amounts (${totalSplitAmount.toString()}) must equal original amount (${originalAmount.toString()})`,
        },
        { status: 400 }
      );
    }

    // Verify all category IDs belong to household
    const categoryIds = splits.filter((s) => s.categoryId).map((s) => s.categoryId as string);
    if (categoryIds.length > 0) {
      const categories = await prisma.budgetCategory.findMany({
        where: { id: { in: categoryIds }, householdId },
        select: { id: true },
      });
      if (categories.length !== new Set(categoryIds).size) {
        return NextResponse.json(
          { success: false, error: 'One or more categories not found' },
          { status: 404 }
        );
      }
    }

    // Use transaction to ensure atomicity - either all operations succeed or none
    await prisma.$transaction(async (tx) => {
      // Mark original transaction as split
      await tx.budgetTransaction.update({
        where: { id: originalTransactionId },
        data: { isSplit: true },
      });

      // Create split child transactions
      for (const split of splits) {
        await tx.budgetTransaction.create({
          data: {
            type: originalTransaction.type,
            transactionDate: originalTransaction.transactionDate,
            paymentDate: originalTransaction.paymentDate,
            amountIls: split.amountIls,
            currency: originalTransaction.currency,
            amountOriginal: split.amountIls, // Splits are always in ILS for simplicity
            categoryId: split.categoryId ?? null,
            payeeId: originalTransaction.payeeId,
            paymentMethod: originalTransaction.paymentMethod,
            notes: split.notes ?? null,
            source: originalTransaction.source,
            isRecurring: originalTransaction.isRecurring,
            isSplit: false,
            originalTransactionId: originalTransactionId,
            profileId: originalTransaction.profileId,
            householdId,
          },
        });
      }
    });

    // Fetch the complete split transaction with children
    const result = await prisma.budgetTransaction.findUnique({
      where: { id: originalTransactionId },
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
        splitChildren: {
          include: {
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result!.id,
        type: result!.type,
        transactionDate: result!.transactionDate.toISOString().split('T')[0],
        amountIls: Number(result!.amountIls),
        isSplit: result!.isSplit,
        categoryName: result!.category?.name ?? null,
        payeeName: result!.payee?.name ?? null,
        splitChildren: result!.splitChildren.map((child) => ({
          id: child.id,
          amountIls: Number(child.amountIls),
          categoryId: child.categoryId,
          categoryName: child.category?.name ?? null,
          notes: child.notes,
        })),
      },
    });
  } catch (error) {
    console.error('Error splitting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to split transaction' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/transactions/split
 * Unsplit a transaction (delete children and mark parent as not split)
 */
export async function DELETE(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify transaction belongs to household and is split
    const transaction = await prisma.budgetTransaction.findFirst({
      where: { id: transactionId, householdId },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    if (!transaction.isSplit) {
      return NextResponse.json(
        { success: false, error: 'Transaction is not split' },
        { status: 400 }
      );
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Delete all split children
      await tx.budgetTransaction.deleteMany({
        where: { originalTransactionId: transactionId },
      });

      // Mark parent as not split
      await tx.budgetTransaction.update({
        where: { id: transactionId },
        data: { isSplit: false },
      });
    });

    return NextResponse.json({
      success: true,
      data: { id: transactionId },
    });
  } catch (error) {
    console.error('Error unsplitting transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unsplit transaction' },
      { status: 500 }
    );
  }
}
