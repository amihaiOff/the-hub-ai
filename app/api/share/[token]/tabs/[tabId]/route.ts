import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { updatePageTabSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ token: string; tabId: string }>;
}

/**
 * PATCH /api/share/[token]/tabs/[tabId]
 * Content edits for a page shared with `access: 'edit'`. No session, no
 * delete, no create, no page-level fields — mirrors
 * app/api/pages/[id]/tabs/[tabId]/route.ts's PATCH (same schema, same field
 * whitelist) but gated by the share token instead of household membership,
 * and refuses outright when the page is only shared as 'view'.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { token, tabId } = await params;
    const page = await prisma.page.findUnique({
      where: { shareToken: token },
      select: { id: true, shareAccess: true },
    });
    if (!page) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (page.shareAccess !== 'edit') {
      return NextResponse.json({ success: false, error: 'Read-only link' }, { status: 403 });
    }
    const tab = await prisma.pageTab.findFirst({
      where: { id: tabId, pageId: page.id },
      select: { id: true },
    });
    if (!tab) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updatePageTabSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const data: Prisma.PageTabUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.content !== undefined) {
      data.content =
        input.content === null ? Prisma.JsonNull : (input.content as Prisma.InputJsonValue);
    }

    const updated = await prisma.pageTab.update({
      where: { id: tabId },
      data,
      select: { id: true, title: true, content: true, sortOrder: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update tab' }, { status: 500 });
  }
}
