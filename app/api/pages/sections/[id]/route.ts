import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updatePageSectionSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.pageSection.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updatePageSectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    const data: Prisma.PageSectionUpdateInput = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

    const updated = await prisma.pageSection.update({
      where: { id },
      data,
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to update section' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.pageSection.findFirst({
    where: { id, householdId: context.activeHousehold.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  // ON DELETE SET NULL nulls sectionId on any pages that referenced it.
  await prisma.pageSection.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
