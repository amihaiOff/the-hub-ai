import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/budget/cc-generic-payees/[id]
 * Remove a generic CC payee name.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const existing = await prisma.ccGenericPayeeName.findFirst({
      where: { id, householdId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await prisma.ccGenericPayeeName.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting CC generic payee name:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete CC generic payee name' },
      { status: 500 }
    );
  }
}
