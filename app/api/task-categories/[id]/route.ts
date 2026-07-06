import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateTaskCategorySchema } from '@/lib/validations/tasks';
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
    const body = await request.json();
    const parsed = updateTaskCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const existing = await prisma.taskCategory.findFirst({
      where: { id, householdId: context.activeHousehold.id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    const updated = await prisma.taskCategory.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update task category:', err);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.taskCategory.findFirst({
      where: { id, householdId: context.activeHousehold.id },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    // Tasks that reference this category will have their categoryId set to
    // NULL by the ON DELETE SET NULL foreign key.
    await prisma.taskCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete task category:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}
