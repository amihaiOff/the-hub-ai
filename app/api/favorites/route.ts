import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createFavoriteSchema } from '@/lib/validations/favorites';
import { getFirstZodError } from '@/lib/validations/common';
import { isKnownRoutePath } from '@/lib/utils/page-titles';
import { toFavoriteRow, FAVORITE_PAGE_SELECT } from '@/lib/api/transformers/favorites';

/*
 * Favourites are per-USER UI state, so these routes use `getCurrentContext()`
 * rather than the pages family's `resolvePagesAccess()`. The latter
 * deliberately collapses agent-token auth onto the household-owner user so
 * headless agents can edit pages — attributing an agent's writes to a real
 * person's favourites drawer would be nonsense, and there is no agent use case
 * here.
 */

/**
 * GET /api/favorites
 * The current user's favourites in the active household, in display order.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const favorites = await prisma.favorite.findMany({
      where: { ownerId: context.user.id, householdId: context.activeHousehold.id },
      // The createdAt tiebreak is load-bearing: sortOrder on create is a
      // read-then-write (max + 1) and therefore not atomic, so two fast adds
      // can land on the same value. Without the tiebreak their relative order
      // would flap between requests.
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { page: { select: FAVORITE_PAGE_SELECT } },
    });

    return NextResponse.json({ success: true, data: favorites.map(toFavoriteRow) });
  } catch (err) {
    console.error('Failed to list favorites:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load favorites' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/favorites
 * Star a destination. Body carries exactly one of `pageId` or `route`.
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
    const parsed = createFavoriteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const { pageId, route } = parsed.data;

    if (pageId) {
      // Re-read scoped to the household so a page from another household can't
      // be starred (the repo's standard ownership guard).
      const page = await prisma.page.findFirst({
        where: { id: pageId, householdId },
        select: { id: true },
      });
      if (!page) {
        return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });
      }
    } else if (route && !isKnownRoutePath(route)) {
      // Validating at write time is what makes the drawer's greyed-out
      // "removed" state meaningful: everything stored is known-good, so a dead
      // favourite can only appear after a code change drops a nav entry.
      return NextResponse.json(
        { success: false, error: "This page can't be added to favorites" },
        { status: 400 }
      );
    }

    // `findFirst`, never `findUnique`: the unique indexes include a nullable
    // column, and SQL `= NULL` never matches, so a compound unique whose
    // nullable member is null is not a usable lookup key.
    const duplicate = await prisma.favorite.findFirst({
      where: { ownerId, householdId, ...(pageId ? { pageId } : { route }) },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ success: false, error: 'Already in favorites' }, { status: 409 });
    }

    // Append. sortOrder is always derived server-side — a client-sent value is
    // ignored (the create schema doesn't accept one).
    const last = await prisma.favorite.findFirst({
      where: { ownerId, householdId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const favorite = await prisma.favorite.create({
      data: {
        ownerId,
        householdId,
        pageId: pageId ?? null,
        route: route ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      include: { page: { select: FAVORITE_PAGE_SELECT } },
    });

    return NextResponse.json({ success: true, data: toFavoriteRow(favorite) }, { status: 201 });
  } catch (err) {
    // The duplicate check above loses a race against a concurrent add; the
    // unique indexes are the backstop, so surface that as the same 409 rather
    // than a generic 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Already in favorites' }, { status: 409 });
    }
    console.error('Failed to create favorite:', err);
    return NextResponse.json({ success: false, error: 'Failed to add favorite' }, { status: 500 });
  }
}
