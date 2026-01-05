import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * POST /api/pension/deposits
 * Add a new deposit to a pension account
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, depositDate, salaryMonth, amount, employer } = body;

    // Validate account ID
    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Validate deposit date
    if (!depositDate) {
      return NextResponse.json(
        { success: false, error: 'Deposit date is required' },
        { status: 400 }
      );
    }

    const parsedDepositDate = new Date(depositDate);
    if (isNaN(parsedDepositDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid deposit date format' },
        { status: 400 }
      );
    }

    // Validate salary month
    if (!salaryMonth) {
      return NextResponse.json(
        { success: false, error: 'Salary month is required' },
        { status: 400 }
      );
    }

    const parsedSalaryMonth = new Date(salaryMonth);
    if (isNaN(parsedSalaryMonth.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid salary month format' },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate employer
    if (!employer || typeof employer !== 'string' || employer.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Employer name is required' },
        { status: 400 }
      );
    }

    // Verify account exists and belongs to the authenticated user
    const account = await prisma.pensionAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Authorization check - verify user owns this account
    if (account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Create the deposit
    const deposit = await prisma.pensionDeposit.create({
      data: {
        accountId,
        depositDate: parsedDepositDate,
        salaryMonth: parsedSalaryMonth,
        amount,
        employer: employer.trim(),
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
    console.error('Error creating deposit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create deposit' },
      { status: 500 }
    );
  }
}
