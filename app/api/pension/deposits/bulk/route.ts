import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { BulkCreateDepositsRequest } from '@/lib/pdf/types';

/**
 * POST /api/pension/deposits/bulk
 * Create multiple pension deposits at once
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as BulkCreateDepositsRequest;
    const { accountId, deposits } = body;

    // Validate account ID
    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Validate deposits array
    if (!Array.isArray(deposits) || deposits.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one deposit is required' },
        { status: 400 }
      );
    }

    // Limit bulk deposit count to prevent abuse
    const MAX_BULK_DEPOSITS = 100;
    if (deposits.length > MAX_BULK_DEPOSITS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_BULK_DEPOSITS} deposits allowed per request` },
        { status: 400 }
      );
    }

    // Validate each deposit
    for (let i = 0; i < deposits.length; i++) {
      const deposit = deposits[i];

      if (!deposit.depositDate) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Deposit date is required` },
          { status: 400 }
        );
      }

      const parsedDepositDate = new Date(deposit.depositDate);
      if (isNaN(parsedDepositDate.getTime())) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Invalid deposit date format` },
          { status: 400 }
        );
      }

      if (!deposit.salaryMonth) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Salary month is required` },
          { status: 400 }
        );
      }

      const parsedSalaryMonth = new Date(deposit.salaryMonth);
      if (isNaN(parsedSalaryMonth.getTime())) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Invalid salary month format` },
          { status: 400 }
        );
      }

      if (
        deposit.amount === undefined ||
        typeof deposit.amount !== 'number' ||
        deposit.amount <= 0
      ) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Amount must be a positive number` },
          { status: 400 }
        );
      }

      if (
        !deposit.employer ||
        typeof deposit.employer !== 'string' ||
        deposit.employer.trim() === ''
      ) {
        return NextResponse.json(
          { success: false, error: `Deposit ${i + 1}: Employer name is required` },
          { status: 400 }
        );
      }
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

    // Create all deposits in a transaction
    const createdDeposits = await prisma.$transaction(
      deposits.map((deposit) =>
        prisma.pensionDeposit.create({
          data: {
            accountId,
            depositDate: new Date(deposit.depositDate),
            salaryMonth: new Date(deposit.salaryMonth),
            amount: deposit.amount,
            employer: deposit.employer.trim(),
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: {
        count: createdDeposits.length,
        deposits: createdDeposits.map((d) => ({
          id: d.id,
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: Number(d.amount),
          employer: d.employer,
          accountId: d.accountId,
        })),
      },
    });
  } catch (error) {
    console.error('Error creating bulk deposits:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create deposits' },
      { status: 500 }
    );
  }
}
