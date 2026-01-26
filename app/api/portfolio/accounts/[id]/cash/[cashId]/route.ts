import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateCashBalanceSchema } from '@/lib/validations/portfolio';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string; cashId: string }>;
}

/**
 * PUT /api/portfolio/accounts/[id]/cash/[cashId]
 * Update a specific cash balance
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: accountId, cashId } = await params;
    const body = await request.json();
    const validation = updateCashBalanceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { amount } = validation.data;

    // Check if cash balance exists
    const existing = await prisma.stockAccountCash.findUnique({
      where: { id: cashId },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Cash balance not found' },
        { status: 404 }
      );
    }

    // Verify it belongs to the correct account
    if (existing.accountId !== accountId) {
      return NextResponse.json(
        { success: false, error: 'Cash balance not found in this account' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Update the cash balance
    const cashBalance = await prisma.stockAccountCash.update({
      where: { id: cashId },
      data: { amount },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: cashBalance.id,
        currency: cashBalance.currency,
        amount: Number(cashBalance.amount),
        accountId: cashBalance.accountId,
        createdAt: cashBalance.createdAt,
        updatedAt: cashBalance.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating cash balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update cash balance' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/accounts/[id]/cash/[cashId]
 * Delete a specific cash balance
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: accountId, cashId } = await params;

    // Check if cash balance exists
    const existing = await prisma.stockAccountCash.findUnique({
      where: { id: cashId },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Cash balance not found' },
        { status: 404 }
      );
    }

    // Verify it belongs to the correct account
    if (existing.accountId !== accountId) {
      return NextResponse.json(
        { success: false, error: 'Cash balance not found in this account' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Delete the cash balance
    await prisma.stockAccountCash.delete({
      where: { id: cashId },
    });

    return NextResponse.json({
      success: true,
      message: 'Cash balance deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting cash balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete cash balance' },
      { status: 500 }
    );
  }
}
