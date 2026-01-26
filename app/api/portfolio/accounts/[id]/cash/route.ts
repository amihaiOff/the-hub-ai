import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createCashBalanceSchema } from '@/lib/validations/portfolio';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portfolio/accounts/[id]/cash
 * Get all cash balances for an account
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: accountId } = await params;

    // Check if account exists and belongs to user
    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    if (account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get all cash balances for this account
    const cashBalances = await prisma.stockAccountCash.findMany({
      where: { accountId },
      orderBy: { currency: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: cashBalances.map((cb) => ({
        id: cb.id,
        currency: cb.currency,
        amount: Number(cb.amount),
        accountId: cb.accountId,
        createdAt: cb.createdAt,
        updatedAt: cb.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching cash balances:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cash balances' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio/accounts/[id]/cash
 * Add or update a cash balance for an account
 * If balance for currency already exists, it updates it
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: accountId } = await params;
    const body = await request.json();
    const validation = createCashBalanceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { currency, amount } = validation.data;

    // Check if account exists and belongs to user
    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    if (account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Upsert the cash balance
    const cashBalance = await prisma.stockAccountCash.upsert({
      where: {
        accountId_currency: {
          accountId,
          currency,
        },
      },
      update: {
        amount,
      },
      create: {
        accountId,
        currency,
        amount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: cashBalance.id,
        currency: cashBalance.currency,
        amount: Number(cashBalance.amount),
        accountId: cashBalance.accountId,
        createdAt: cashBalance.createdAt,
        updatedAt: cashBalance.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error creating/updating cash balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save cash balance' },
      { status: 500 }
    );
  }
}
