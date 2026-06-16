import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createBudgetAccountNameSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/account-names
 * List all account-number → name mappings for the household.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const items = await prisma.budgetAccountName.findMany({
      where: { householdId: context.activeHousehold.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, accountNumber: true, name: true },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching budget account names:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}

/**
 * POST /api/budget/account-names
 * Create a new account-number → name mapping for the household.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createBudgetAccountNameSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const item = await prisma.budgetAccountName.create({
      data: {
        accountNumber: validation.data.accountNumber.trim(),
        name: validation.data.name.trim(),
        householdId: context.activeHousehold.id,
      },
      select: { id: true, accountNumber: true, name: true },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { success: false, error: 'This account number already has a name' },
        { status: 409 }
      );
    }
    console.error('Error creating budget account name:', error);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
