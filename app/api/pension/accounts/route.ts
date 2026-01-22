import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createPensionAccountSchema = z.object({
  type: z.enum(['pension', 'hishtalmut']),
  providerName: z.string().trim().min(1).max(200),
  accountName: z.string().trim().min(1).max(200),
  currentValue: z.number().nonnegative(),
  feeFromDeposit: z.number().min(0).max(100),
  feeFromTotal: z.number().min(0).max(100),
});

/**
 * POST /api/pension/accounts
 * Create a new pension account
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createPensionAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { type, providerName, accountName, currentValue, feeFromDeposit, feeFromTotal } =
      validation.data;

    // Create the account (avoid include for Neon serverless compatibility)
    const account = await prisma.pensionAccount.create({
      data: {
        type,
        providerName,
        accountName,
        currentValue,
        feeFromDeposit,
        feeFromTotal,
        userId: user.id,
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
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
