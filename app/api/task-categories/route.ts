import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTaskCategorySchema } from '@/lib/validations/tasks';
import { getFirstZodError } from '@/lib/validations/common';

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const categories = await prisma.taskCategory.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ success: true, data: categories });
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createTaskCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const created = await prisma.taskCategory.create({
      data: {
        name: parsed.data.name,
        color: parsed.data.color ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        householdId: context.activeHousehold.id,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A category with that name already exists' },
        { status: 409 }
      );
    }
    console.error('Failed to create task category:', err);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
