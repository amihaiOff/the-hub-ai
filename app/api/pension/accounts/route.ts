import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * POST /api/pension/accounts
 * Create a new pension account
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, providerName, accountName, currentValue, feeFromDeposit, feeFromTotal } = body;

    // Validate type
    if (!type || !['pension', 'hishtalmut'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Type must be "pension" or "hishtalmut"' },
        { status: 400 }
      );
    }

    // Validate provider name
    if (!providerName || typeof providerName !== 'string' || providerName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Provider name is required' },
        { status: 400 }
      );
    }

    // Validate account name
    if (!accountName || typeof accountName !== 'string' || accountName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Account name is required' },
        { status: 400 }
      );
    }

    // Validate current value
    if (currentValue === undefined || typeof currentValue !== 'number' || currentValue < 0) {
      return NextResponse.json(
        { success: false, error: 'Current value must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate fees (percentage as decimal, e.g., 0.5 for 0.5%)
    if (feeFromDeposit === undefined || typeof feeFromDeposit !== 'number' || feeFromDeposit < 0 || feeFromDeposit > 100) {
      return NextResponse.json(
        { success: false, error: 'Fee from deposit must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    if (feeFromTotal === undefined || typeof feeFromTotal !== 'number' || feeFromTotal < 0 || feeFromTotal > 100) {
      return NextResponse.json(
        { success: false, error: 'Fee from total must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    // Create the account
    const account = await prisma.pensionAccount.create({
      data: {
        type,
        providerName: providerName.trim(),
        accountName: accountName.trim(),
        currentValue,
        feeFromDeposit,
        feeFromTotal,
        userId: user.id,
      },
      include: {
        deposits: true,
      },
    });

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
        deposits: [],
      },
    });
  } catch (error) {
    console.error('Error creating pension account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create pension account' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pension/accounts
 * Get all pension accounts for the authenticated user
 */
export async function GET() {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const accounts = await prisma.pensionAccount.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { deposits: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: accounts.map((account) => ({
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        depositsCount: account._count.deposits,
      })),
    });
  } catch (error) {
    console.error('Error fetching pension accounts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pension accounts' },
      { status: 500 }
    );
  }
}
