import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createDepositSchema } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

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
    const validation = createDepositSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { accountId, depositDate, salaryMonth, amount, employer } = validation.data;

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
        depositDate,
        salaryMonth,
        amount,
        employer,
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
