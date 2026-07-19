import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { createDepositSchema } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/pension/deposits
 * Add a new deposit to a pension account. The account must be visible to
 * the caller's household (H1 of the codebase review).
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
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

    // Verify the parent account is household-visible. Collapsing
    // not-found and forbidden to a single 404 (indistinguishable from the
    // caller's POV under household scoping).
    const account = await prisma.pensionAccount.findFirst({
      where: { id: accountId, ...householdVisibleWhere(context.activeHousehold.id) },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const deposit = await prisma.pensionDeposit.create({
      data: { accountId, depositDate, salaryMonth, amount, employer },
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
