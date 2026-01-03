import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pension/accounts/[id]
 * Get a single pension account with its deposits
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

    const account = await prisma.pensionAccount.findUnique({
      where: { id },
      include: {
        deposits: {
          orderBy: { salaryMonth: 'desc' },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (account.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const totalDeposits = account.deposits.reduce(
      (sum, d) => sum + Number(d.amount),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        totalDeposits,
        depositsCount: account.deposits.length,
        deposits: account.deposits.map((d) => ({
          id: d.id,
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: Number(d.amount),
          employer: d.employer,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching pension account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pension account' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pension/accounts/[id]
 * Update a pension account
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
    const { providerName, accountName, currentValue, feeFromDeposit, feeFromTotal } = body;

    // Validate inputs if provided
    if (providerName !== undefined && (typeof providerName !== 'string' || providerName.trim() === '')) {
      return NextResponse.json(
        { success: false, error: 'Provider name cannot be empty' },
        { status: 400 }
      );
    }

    if (accountName !== undefined && (typeof accountName !== 'string' || accountName.trim() === '')) {
      return NextResponse.json(
        { success: false, error: 'Account name cannot be empty' },
        { status: 400 }
      );
    }

    if (currentValue !== undefined && (typeof currentValue !== 'number' || currentValue < 0)) {
      return NextResponse.json(
        { success: false, error: 'Current value must be a non-negative number' },
        { status: 400 }
      );
    }

    if (feeFromDeposit !== undefined && (typeof feeFromDeposit !== 'number' || feeFromDeposit < 0 || feeFromDeposit > 100)) {
      return NextResponse.json(
        { success: false, error: 'Fee from deposit must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    if (feeFromTotal !== undefined && (typeof feeFromTotal !== 'number' || feeFromTotal < 0 || feeFromTotal > 100)) {
      return NextResponse.json(
        { success: false, error: 'Fee from total must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    // Check if account exists
    const existing = await prisma.pensionAccount.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Update the account
    const account = await prisma.pensionAccount.update({
      where: { id },
      data: {
        ...(providerName !== undefined && { providerName: providerName.trim() }),
        ...(accountName !== undefined && { accountName: accountName.trim() }),
        ...(currentValue !== undefined && { currentValue }),
        ...(feeFromDeposit !== undefined && { feeFromDeposit }),
        ...(feeFromTotal !== undefined && { feeFromTotal }),
      },
      include: {
        deposits: {
          orderBy: { salaryMonth: 'desc' },
        },
      },
    });

    const totalDeposits = account.deposits.reduce(
      (sum, d) => sum + Number(d.amount),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        totalDeposits,
        depositsCount: account.deposits.length,
        deposits: account.deposits.map((d) => ({
          id: d.id,
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: Number(d.amount),
          employer: d.employer,
        })),
      },
    });
  } catch (error) {
    console.error('Error updating pension account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update pension account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pension/accounts/[id]
 * Delete a pension account and all its deposits
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

    // Check if account exists
    const existing = await prisma.pensionAccount.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete the account (deposits will cascade delete)
    await prisma.pensionAccount.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting pension account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete pension account' },
      { status: 500 }
    );
  }
}
