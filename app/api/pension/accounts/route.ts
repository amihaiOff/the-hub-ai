import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { z } from 'zod';

const createPensionAccountSchema = z.object({
  type: z.enum(['pension', 'hishtalmut']),
  providerName: z.string().trim().min(1).max(200),
  accountName: z.string().trim().min(1).max(200),
  accountNumber: z.string().trim().max(50).nullable().optional(),
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
    // Household-scoped create. Legacy `userId` still stamped so old-model
    // consumers keep working through the migration; the owner Profile is
    // wired up so household visibility works from day one via
    // `householdVisibleWhere`.
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const user = context.user;
    const creatorProfileId = context.profile.id;

    const body = await request.json();
    const validation = createPensionAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const {
      type,
      providerName,
      accountName,
      accountNumber,
      currentValue,
      feeFromDeposit,
      feeFromTotal,
    } = validation.data;

    const account = await prisma.pensionAccount.create({
      data: {
        type,
        providerName,
        accountName,
        accountNumber: accountNumber || null,
        currentValue,
        feeFromDeposit,
        feeFromTotal,
        userId: user.id,
        owners: { create: { profileId: creatorProfileId } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        totalDeposits: 0,
        depositsCount: 0,
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
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const accounts = await prisma.pensionAccount.findMany({
      where: householdVisibleWhere(householdId),
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
        accountNumber: account.accountNumber,
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
