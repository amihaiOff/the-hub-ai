import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { bulkDepositSchema, validateBulkDeposit } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

// Extend timeout for bulk operations with many deposits
export const maxDuration = 30;

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

    const body = await request.json();
    const validation = bulkDepositSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { accountId, deposits } = validation.data;

    // Validate each deposit individually with index for error messages
    for (let i = 0; i < deposits.length; i++) {
      const errors = validateBulkDeposit(deposits[i], i);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: errors[0] }, { status: 400 });
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

    // Create deposits sequentially without transaction (Neon serverless compatibility)
    // Note: At this point, all deposits have been validated by validateBulkDeposit,
    // so we can safely use non-null assertions for the required fields
    const createdDeposits: Awaited<ReturnType<typeof prisma.pensionDeposit.create>>[] = [];
    try {
      for (const deposit of deposits) {
        const created = await prisma.pensionDeposit.create({
          data: {
            accountId,
            depositDate: new Date(deposit.depositDate!),
            salaryMonth: new Date(deposit.salaryMonth!),
            amount: deposit.amount!,
            employer: deposit.employer!.trim(),
          },
        });
        createdDeposits.push(created);
      }
    } catch (createError) {
      // Rollback: delete any created deposits on failure
      if (createdDeposits.length > 0) {
        await prisma.pensionDeposit.deleteMany({
          where: { id: { in: createdDeposits.map((d) => d.id) } },
        });
      }
      throw createError;
    }

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
