import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createPageTabSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/pages/[id]/tabs
 * Create a new tab on a page. It sorts to the end; default title "Tab N".
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    // Scope to the active household via the parent page.
    const page = await prisma.page.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true, _count: { select: { tabs: true } } },
    });
    if (!page) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createPageTabSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const last = await prisma.pageTab.findFirst({
      where: { pageId: id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await prisma.pageTab.create({
      data: {
        pageId: id,
        title: input.title ?? `Tab ${page._count.tabs + 1}`,
        content: input.content ? (input.content as Prisma.InputJsonValue) : Prisma.JsonNull,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true, title: true, content: true, sortOrder: true },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create tab' }, { status: 500 });
  }
}
