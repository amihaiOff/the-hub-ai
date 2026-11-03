import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { setHabitLogSchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { getHabitOwner } from '@/lib/habits/owner';
import { serializeHabit, ymdToDate } from '@/lib/habits/serialize';
import { canMark } from '@/lib/habits/schedule';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status });

/**
 * PUT /api/habits/[id]/log — mark one scheduled day Done / Not done, or clear
 * it (`status: null`). Used by the page, the dashboard card and the
 * notification's buttons (service worker, same-origin session cookie).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const owner = await getHabitOwner();
  if (!owner) return fail('Unauthorized', 401);
  const { id } = await params;
  const parsed = setHabitLogSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(getFirstZodError(parsed.error), 400);
  // Owner only, not the active household: a notification button can arrive
  // while the device is signed into another of the owner's households.
  const habit = await prisma.habit.findFirst({ where: { id, ownerId: owner.ownerId } });
  if (!habit) return fail('Not found', 404);

  const { date, status } = parsed.data;
  const where = { habitId_date: { habitId: id, date: ymdToDate(date) } };
  if (status === null) {
    await prisma.habitLog.delete({ where }).catch(() => undefined); // already clear
    return NextResponse.json({ success: true });
  }
  // Only a scheduled day whose time has come can be marked.
  if (!canMark(serializeHabit(habit), date, new Date())) {
    return fail('This day is not open for marking', 400);
  }
  await prisma.habitLog.upsert({
    where,
    create: { habitId: id, date: ymdToDate(date), status },
    update: { status },
  });
  return NextResponse.json({ success: true });
}
