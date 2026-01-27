import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateTransactionSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { Prisma } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Transform a transaction from database format to API response format
 */
function transformTransaction(tx: {
  id: string;
  type: string;
  transactionDate: Date;
  paymentDate: Date | null;
  amountIls: Prisma.Decimal;
  currency: string;
  amountOriginal: Prisma.Decimal;
  categoryId: string | null;
  payeeId: string | null;
  paymentMethod: string;
  paymentNumber: number | null;
  totalPayments: number | null;
  notes: string | null;
  source: string;
  isRecurring: boolean;
  isSplit: boolean;
  originalTransactionId: string | null;
  profileId: string | null;
  householdId: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: { tag: { id: string } }[];
  category?: { id: string; name: string } | null;
  payee?: { id: string; name: string } | null;
  profile?: { id: string; name: string } | null;
}) {
  return {
    id: tx.id,
    type: tx.type,
    transactionDate: tx.transactionDate.toISOString().split('T')[0],
    paymentDate: tx.paymentDate?.toISOString().split('T')[0] ?? null,
    amountIls: Number(tx.amountIls),
    currency: tx.currency,
    amountOriginal: Number(tx.amountOriginal),
    categoryId: tx.categoryId,
    categoryName: tx.category?.name ?? null,
    payeeId: tx.payeeId,
    payeeName: tx.payee?.name ?? null,
    paymentMethod: tx.paymentMethod,
    paymentNumber: tx.paymentNumber,
    totalPayments: tx.totalPayments,
    notes: tx.notes,
    source: tx.source,
    isRecurring: tx.isRecurring,
    isSplit: tx.isSplit,
    originalTransactionId: tx.originalTransactionId,
    profileId: tx.profileId,
    profileName: tx.profile?.name ?? null,
    householdId: tx.householdId,
    tagIds: tx.tags?.map((t) => t.tag.id) ?? [],
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
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
      where: { id, householdId },
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

    // Verify transaction belongs to household
    const existingTransaction = await prisma.budgetTransaction.findFirst({
      where: { id, householdId },
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

    // Build update data
    const updateData: Prisma.BudgetTransactionUpdateInput = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.transactionDate !== undefined)
      updateData.transactionDate = new Date(data.transactionDate);
    if (data.paymentDate !== undefined)
      updateData.paymentDate = data.paymentDate ? new Date(data.paymentDate) : null;
    if (data.amountIls !== undefined) updateData.amountIls = data.amountIls;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.amountOriginal !== undefined) updateData.amountOriginal = data.amountOriginal;
    if (data.categoryId !== undefined)
      updateData.category = data.categoryId
        ? { connect: { id: data.categoryId } }
        : { disconnect: true };
    if (data.payeeId !== undefined)
      updateData.payee = data.payeeId ? { connect: { id: data.payeeId } } : { disconnect: true };
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.paymentNumber !== undefined) updateData.paymentNumber = data.paymentNumber;
    if (data.totalPayments !== undefined) updateData.totalPayments = data.totalPayments;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
    if (data.profileId !== undefined)
      updateData.profile = data.profileId
        ? { connect: { id: data.profileId } }
        : { disconnect: true };

    // Update transaction
    await prisma.budgetTransaction.update({
      where: { id },
      data: updateData,
    });

    // Update tags if provided
    if (data.tagIds !== undefined) {
      // Delete existing tags
      await prisma.budgetTransactionTag.deleteMany({
        where: { transactionId: id },
      });

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

    // Verify transaction belongs to household
    const existingTransaction = await prisma.budgetTransaction.findFirst({
      where: { id, householdId },
    });

    if (!existingTransaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    // Delete (cascades to tag links and split children)
    await prisma.budgetTransaction.delete({
      where: { id },
    });

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
