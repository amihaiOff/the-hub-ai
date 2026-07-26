import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

// 1–28 keeps every month covered without month-length rollover ambiguity.
const updateSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(28),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { snapshotDayOfMonth: true },
  });
  return NextResponse.json({
    success: true,
    data: { dayOfMonth: household?.snapshotDayOfMonth ?? 26 },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }
    const updated = await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { snapshotDayOfMonth: validation.data.dayOfMonth },
      select: { snapshotDayOfMonth: true },
    });
    return NextResponse.json({
      success: true,
      data: { dayOfMonth: updated.snapshotDayOfMonth },
    });
  } catch (error) {
    console.error('Error updating snapshot day:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
