import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/favorites/[id]
 * Un-star a destination. There is no PATCH: favourites can't be renamed and
 * ordering goes through /api/favorites/reorder.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // `ownerId` in this guard is deliberate and NOT the repo's usual
    // household-only ownership check: favourites are per-user, so scoping only
    // by household would let one housemate delete the other's favourites.
    const existing = await prisma.favorite.findFirst({
      where: { id, ownerId: context.user.id, householdId: context.activeHousehold.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await prisma.favorite.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete favorite:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to remove favorite' },
      { status: 500 }
    );
  }
}
