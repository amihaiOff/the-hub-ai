import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { updateDepositSchema } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Load a deposit by id, but only if its parent account is visible to the
 * given household. Returns null when the deposit doesn't exist OR its
 * account is out of scope — collapsed to a single 404 at the callsite.
 */
async function loadOwnedDeposit(id: string, householdId: string) {
  return prisma.pensionDeposit.findFirst({
    where: {
      id,
      account: householdVisibleWhere(householdId),
    },
    include: { account: true },
  });
}

/**
 * GET /api/pension/deposits/[id]
 * Get a single deposit (household-scoped).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const deposit = await loadOwnedDeposit(id, context.activeHousehold.id);
    if (!deposit) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
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
 * Update a deposit (household-scoped write).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
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

    const existing = await loadOwnedDeposit(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
    }

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
 * Delete a deposit (household-scoped).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const existing = await loadOwnedDeposit(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Deposit not found' }, { status: 404 });
    }

    await prisma.pensionDeposit.delete({ where: { id } });

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
