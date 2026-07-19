import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { updatePensionAccountSchema } from '@/lib/validations/pension';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Load the pension account by id, but only if it's visible to the given
 * household. Returns null when it doesn't exist OR isn't in scope — the
 * two cases are indistinguishable from the caller's perspective so we
 * collapse them to a 404 at the route level (matches the previous
 * "not found OR forbidden" pair with less enumeration).
 */
async function loadOwnedAccount(id: string, householdId: string) {
  return prisma.pensionAccount.findFirst({
    where: { id, ...householdVisibleWhere(householdId) },
    include: {
      deposits: { orderBy: { salaryMonth: 'desc' } },
    },
  });
}

/**
 * GET /api/pension/accounts/[id]
 * Get a single pension account with its deposits (household-scoped).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const account = await loadOwnedAccount(id, context.activeHousehold.id);
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;
    const totalDeposits = fromCents(
      account.deposits.reduce((sum, d) => sum + toCents(d.amount), 0)
    );

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
 * Update a pension account (household-scoped write).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const validation = updatePensionAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { providerName, accountName, accountNumber, currentValue, feeFromDeposit, feeFromTotal } =
      validation.data;

    const existing = await loadOwnedAccount(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    await prisma.pensionAccount.update({
      where: { id },
      data: {
        ...(providerName !== undefined && { providerName }),
        ...(accountName !== undefined && { accountName }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(currentValue !== undefined && { currentValue }),
        ...(feeFromDeposit !== undefined && { feeFromDeposit }),
        ...(feeFromTotal !== undefined && { feeFromTotal }),
      },
    });

    const account = await prisma.pensionAccount.findUniqueOrThrow({
      where: { id },
      include: {
        deposits: { orderBy: { salaryMonth: 'desc' } },
      },
    });

    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;
    const totalDeposits = fromCents(
      account.deposits.reduce((sum, d) => sum + toCents(d.amount), 0)
    );

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
 * Delete a pension account and all its deposits (household-scoped).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const existing = await loadOwnedAccount(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Deposits cascade-delete via the FK.
    await prisma.pensionAccount.delete({ where: { id } });

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
