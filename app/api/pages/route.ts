import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createPageSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/pages
 * Lists the active household's pages, ordered for the sidebar (manual sort,
 * then most-recently-updated). Content is omitted from the list to keep the
 * payload small — the editor fetches a single page's content separately.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const pages = await prisma.page.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      emoji: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, data: pages });
}

/**
 * POST /api/pages
 * Create a page. Owner = current user, household = active household. New pages
 * sort to the top (sortOrder one below the current minimum).
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createPageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // Place new pages at the top of the list.
    const top = await prisma.page.findFirst({
      where: { householdId: context.activeHousehold.id },
      orderBy: { sortOrder: 'asc' },
      select: { sortOrder: true },
    });

    const created = await prisma.page.create({
      data: {
        title: input.title ?? '',
        emoji: input.emoji ?? null,
        content: input.content ? (input.content as Prisma.InputJsonValue) : Prisma.JsonNull,
        sortOrder: (top?.sortOrder ?? 0) - 1,
        ownerId: context.user.id,
        householdId: context.activeHousehold.id,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create page' }, { status: 500 });
  }
}
