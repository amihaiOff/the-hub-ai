import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateBudgetAccountNameSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/budget/account-names/[id]
 * Rename an existing account-number → name mapping.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = updateBudgetAccountNameSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const existing = await prisma.budgetAccountName.findFirst({
      where: { id, householdId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const item = await prisma.budgetAccountName.update({
      where: { id },
      data: { name: validation.data.name.trim() },
      select: { id: true, accountNumber: true, name: true },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Error updating budget account name:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}

/**
 * DELETE /api/budget/account-names/[id]
 * Remove an account-number → name mapping.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const existing = await prisma.budgetAccountName.findFirst({
      where: { id, householdId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await prisma.budgetAccountName.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting budget account name:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}
