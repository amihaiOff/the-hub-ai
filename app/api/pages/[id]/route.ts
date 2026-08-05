import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updatePageSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const page = await prisma.page.findFirst({
    where: { id, householdId: context.activeHousehold.id },
    include: {
      tabs: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, content: true, sortOrder: true },
      },
    },
  });
  if (!page) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: page });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.page.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updatePageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // Only touch keys the client sent so partial (autosave) patches don't clobber.
    const data: Prisma.PageUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.emoji !== undefined) data.emoji = input.emoji;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.autoCapitalize !== undefined) data.autoCapitalize = input.autoCapitalize;
    if (input.content !== undefined) {
      data.content =
        input.content === null ? Prisma.JsonNull : (input.content as Prisma.InputJsonValue);
    }

    const updated = await prisma.page.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update page' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.page.findFirst({
    where: { id, householdId: context.activeHousehold.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  await prisma.page.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
