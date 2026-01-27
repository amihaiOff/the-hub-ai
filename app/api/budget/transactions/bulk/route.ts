import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import {
  bulkTransactionSchema,
  bulkCategorizeSchema,
  bulkDeleteSchema,
} from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/budget/transactions/bulk
 * Bulk create transactions (e.g., from import)
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = bulkTransactionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { transactions } = validation.data;

    // Collect all categoryIds, payeeIds, profileIds, and tagIds to validate
    const categoryIds = new Set<string>();
    const payeeIds = new Set<string>();
    const profileIds = new Set<string>();
    const tagIds = new Set<string>();

    for (const tx of transactions) {
      if (tx.categoryId) categoryIds.add(tx.categoryId);
      if (tx.payeeId) payeeIds.add(tx.payeeId);
      if (tx.profileId) profileIds.add(tx.profileId);
      if (tx.tagIds) tx.tagIds.forEach((id) => tagIds.add(id));
    }

    // Validate categories
    if (categoryIds.size > 0) {
      const categories = await prisma.budgetCategory.findMany({
        where: { id: { in: [...categoryIds] }, householdId },
        select: { id: true },
      });
      if (categories.length !== categoryIds.size) {
        return NextResponse.json(
          { success: false, error: 'One or more categories not found' },
          { status: 404 }
        );
      }
    }

    // Validate payees
    if (payeeIds.size > 0) {
      const payees = await prisma.budgetPayee.findMany({
        where: { id: { in: [...payeeIds] }, householdId },
        select: { id: true },
      });
      if (payees.length !== payeeIds.size) {
        return NextResponse.json(
          { success: false, error: 'One or more payees not found' },
          { status: 404 }
        );
      }
    }

    // Validate profiles
    if (profileIds.size > 0) {
      const profiles = await prisma.householdMember.findMany({
        where: { householdId, profileId: { in: [...profileIds] } },
        select: { profileId: true },
      });
      if (profiles.length !== profileIds.size) {
        return NextResponse.json(
          { success: false, error: 'One or more profiles not found' },
          { status: 404 }
        );
      }
    }

    // Validate tags
    if (tagIds.size > 0) {
      const tags = await prisma.budgetTag.findMany({
        where: { id: { in: [...tagIds] }, householdId },
        select: { id: true },
      });
      if (tags.length !== tagIds.size) {
        return NextResponse.json(
          { success: false, error: 'One or more tags not found' },
          { status: 404 }
        );
      }
    }

    // Create transactions one by one (Neon compatibility)
    const createdIds: string[] = [];

    for (const data of transactions) {
      const transaction = await prisma.budgetTransaction.create({
        data: {
          type: data.type,
          transactionDate: new Date(data.transactionDate),
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
          amountIls: data.amountIls,
          currency: data.currency,
          amountOriginal: data.amountOriginal ?? data.amountIls,
          categoryId: data.categoryId ?? null,
          payeeId: data.payeeId ?? null,
          paymentMethod: data.paymentMethod,
          paymentNumber: data.paymentNumber ?? null,
          totalPayments: data.totalPayments ?? null,
          notes: data.notes ?? null,
          source: data.source,
          isRecurring: data.isRecurring,
          profileId: data.profileId ?? null,
          householdId,
        },
      });

      createdIds.push(transaction.id);

      // Create tag links
      if (data.tagIds && data.tagIds.length > 0) {
        for (const tagId of data.tagIds) {
          await prisma.budgetTransactionTag.create({
            data: {
              transactionId: transaction.id,
              tagId,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created: createdIds.length,
        ids: createdIds,
      },
    });
  } catch (error) {
    console.error('Error bulk creating transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create transactions' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budget/transactions/bulk
 * Bulk categorize transactions
 */
export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = bulkCategorizeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { transactionIds, categoryId } = validation.data;

    // Verify category belongs to household
    const category = await prisma.budgetCategory.findFirst({
      where: { id: categoryId, householdId },
    });

    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    // Verify all transactions belong to household
    const transactions = await prisma.budgetTransaction.findMany({
      where: {
        id: { in: transactionIds },
        householdId,
      },
      select: { id: true },
    });

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more transactions not found' },
        { status: 404 }
      );
    }

    // Update transactions one by one (Neon compatibility)
    for (const txId of transactionIds) {
      await prisma.budgetTransaction.update({
        where: { id: txId },
        data: { categoryId },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        updated: transactionIds.length,
        categoryId,
      },
    });
  } catch (error) {
    console.error('Error bulk categorizing transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to categorize transactions' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/transactions/bulk
 * Bulk delete transactions
 */
export async function DELETE(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = bulkDeleteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { transactionIds } = validation.data;

    // Verify all transactions belong to household
    const transactions = await prisma.budgetTransaction.findMany({
      where: {
        id: { in: transactionIds },
        householdId,
      },
      select: { id: true },
    });

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more transactions not found' },
        { status: 404 }
      );
    }

    // Delete transactions (cascades to tag links and split children)
    await prisma.budgetTransaction.deleteMany({
      where: {
        id: { in: transactionIds },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        deleted: transactionIds.length,
      },
    });
  } catch (error) {
    console.error('Error bulk deleting transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete transactions' },
      { status: 500 }
    );
  }
}
