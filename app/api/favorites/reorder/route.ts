import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { reorderFavoritesSchema } from '@/lib/validations/favorites';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/favorites/reorder
 * Bulk-update the sortOrder of the current user's favourites. Drives the order
 * in the favourites drawer, which reads them ordered by sortOrder.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const ownerId = context.user.id;
    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const parsed = reorderFavoritesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    const { favorites } = parsed.data;
    const ids = favorites.map((f) => f.id);

    // Scoped by owner as well as household, so another user's ids 404 rather
    // than silently succeeding. Note this verifies every submitted id exists
    // and is owned — NOT that the list is the complete set, so a partial
    // permutation could leave duplicate sortOrders. Self-inflicted only (the
    // client always sends the full list) and the GET's createdAt tiebreak keeps
    // the result deterministic either way.
    const existing = await prisma.favorite.findMany({
      where: { id: { in: ids }, ownerId, householdId },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { success: false, error: 'One or more favorites not found' },
        { status: 404 }
      );
    }

    // Atomic so a mid-loop failure can't leave a half-renumbered order. Uses
    // the interactive transaction form (the array form / updateMany are the
    // ones that misbehave on the Neon adapter).
    await prisma.$transaction(async (tx) => {
      for (const f of favorites) {
        await tx.favorite.update({
          where: { id: f.id },
          data: { sortOrder: f.sortOrder },
        });
      }
    });

    return NextResponse.json({ success: true, data: { updated: favorites.length } });
  } catch (err) {
    console.error('Failed to reorder favorites:', err);
    return NextResponse.json({ success: false, error: 'Failed to reorder' }, { status: 500 });
  }
}
