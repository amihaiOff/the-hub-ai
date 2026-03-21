import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/insurance/[id]
 * Delete a specific insurance policy
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify policy belongs to this household
    const policy = await prisma.insurancePolicy.findFirst({
      where: { id, householdId },
    });

    if (!policy) {
      return NextResponse.json({ success: false, error: 'Policy not found' }, { status: 404 });
    }

    await prisma.insurancePolicy.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting insurance policy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete insurance policy' },
      { status: 500 }
    );
  }
}
