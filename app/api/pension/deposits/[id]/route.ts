import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateDepositSchema } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pension/deposits/[id]
 * Get a single deposit
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deposit = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!deposit) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this deposit
    if (deposit.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: deposit.id,
        depositDate: deposit.depositDate,
        salaryMonth: deposit.salaryMonth,
        amount: Number(deposit.amount),
        employer: deposit.employer,
        accountId: deposit.accountId,
      },
    });
  } catch (error) {
    console.error('Error fetching deposit:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch deposit' }, { status: 500 });
  }
}

/**
 * PUT /api/pension/deposits/[id]
 * Update a deposit
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateDepositSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { depositDate, salaryMonth, amount, employer } = validation.data;

    // Check if deposit exists and include account for authorization
    const existing = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this deposit
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Update the deposit
    const deposit = await prisma.pensionDeposit.update({
      where: { id },
      data: {
        ...(depositDate !== undefined && { depositDate }),
        ...(salaryMonth !== undefined && { salaryMonth }),
        ...(amount !== undefined && { amount }),
        ...(employer !== undefined && { employer }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: deposit.id,
        depositDate: deposit.depositDate,
        salaryMonth: deposit.salaryMonth,
        amount: Number(deposit.amount),
        employer: deposit.employer,
        accountId: deposit.accountId,
      },
    });
  } catch (error) {
    console.error('Error updating deposit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update deposit' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pension/deposits/[id]
 * Delete a deposit
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if deposit exists and include account for authorization
    const existing = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this deposit
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Delete the deposit
    await prisma.pensionDeposit.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Deposit deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting deposit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete deposit' },
      { status: 500 }
    );
  }
}
