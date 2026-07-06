import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTaskTagSchema } from '@/lib/validations/tasks';
import { getFirstZodError } from '@/lib/validations/common';

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const tags = await prisma.taskTag.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ success: true, data: tags });
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createTaskTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const created = await prisma.taskTag.create({
      data: {
        name: parsed.data.name,
        color: parsed.data.color ?? null,
        householdId: context.activeHousehold.id,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A tag with that name already exists' },
        { status: 409 }
      );
    }
    console.error('Failed to create task tag:', err);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
