import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updatePageTabSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string; tabId: string }>;
}

/** Confirm the tab belongs to a page in the caller's active household. */
async function findScopedTab(pageId: string, tabId: string, householdId: string) {
  return prisma.pageTab.findFirst({
    where: { id: tabId, pageId, page: { householdId } },
    select: { id: true, pageId: true },
  });
}

/**
 * PATCH /api/pages/[id]/tabs/[tabId]
 * Partial update (title / content / sortOrder) — only keys the client sends are
 * touched, so an autosave that sends just `{ content }` never clobbers the title.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id, tabId } = await params;
    const existing = await findScopedTab(id, tabId, context.activeHousehold.id);
    if (!existing) {
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
      select: { id: true, title: true, content: true, sortOrder: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update tab' }, { status: 500 });
  }
}

/**
 * DELETE /api/pages/[id]/tabs/[tabId]
 * Removes a tab. Refuses to delete the last remaining tab — a page must always
 * keep at least one.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id, tabId } = await params;
    const existing = await findScopedTab(id, tabId, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Atomic last-tab guard: delete only if a *sibling* tab still exists. Doing
    // the check inside the write (rather than count()-then-delete()) closes the
    // race where two concurrent deletes both pass a stale count and leave the
    // page with zero tabs.
    const { count } = await prisma.pageTab.deleteMany({
      where: { id: tabId, pageId: id, page: { tabs: { some: { id: { not: tabId } } } } },
    });
    if (count === 0) {
      return NextResponse.json(
        { success: false, error: 'A page must have at least one tab' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to delete tab' }, { status: 500 });
  }
}
