import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const deposit = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!deposit) {
      return NextResponse.json(
        { success: false, error: 'Deposit not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns the account containing this deposit
    if (deposit.account.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
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
    return NextResponse.json(
      { success: false, error: 'Failed to fetch deposit' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { depositDate, salaryMonth, amount, employer } = body;

    // Validate inputs if provided
    let parsedDepositDate: Date | undefined;
    if (depositDate !== undefined) {
      parsedDepositDate = new Date(depositDate);
      if (isNaN(parsedDepositDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid deposit date format' },
          { status: 400 }
        );
      }
    }

    let parsedSalaryMonth: Date | undefined;
    if (salaryMonth !== undefined) {
      parsedSalaryMonth = new Date(salaryMonth);
      if (isNaN(parsedSalaryMonth.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid salary month format' },
          { status: 400 }
        );
      }
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    if (employer !== undefined && (typeof employer !== 'string' || employer.trim() === '')) {
      return NextResponse.json(
        { success: false, error: 'Employer name cannot be empty' },
        { status: 400 }
      );
    }

    // Check if deposit exists and include account for authorization
    const existing = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Deposit not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns the account containing this deposit
    if (existing.account.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Update the deposit
    const deposit = await prisma.pensionDeposit.update({
      where: { id },
      data: {
        ...(parsedDepositDate !== undefined && { depositDate: parsedDepositDate }),
        ...(parsedSalaryMonth !== undefined && { salaryMonth: parsedSalaryMonth }),
        ...(amount !== undefined && { amount }),
        ...(employer !== undefined && { employer: employer.trim() }),
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check if deposit exists and include account for authorization
    const existing = await prisma.pensionDeposit.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Deposit not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns the account containing this deposit
    if (existing.account.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
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
