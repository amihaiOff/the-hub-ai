import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHabitSchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { getHabitOwner } from '@/lib/habits/owner';
import { serializeHabit, ymdToDate } from '@/lib/habits/serialize';
import { israelClock } from '@/lib/habits/schedule';

const unauthorized = () =>
  NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

/** GET /api/habits — the signed-in user's habits. `?archived=1` lists the archive. */
export async function GET(request: NextRequest) {
  const owner = await getHabitOwner();
  if (!owner) return unauthorized();
  const archived = request.nextUrl.searchParams.get('archived') === '1';
  const habits = await prisma.habit.findMany({
    where: { ...owner, archivedAt: archived ? { not: null } : null },
    orderBy: archived ? [{ archivedAt: 'desc' }] : [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ success: true, data: habits.map(serializeHabit) });
}

/** POST /api/habits — new habits go to the bottom of the list. */
export async function POST(request: NextRequest) {
  const owner = await getHabitOwner();
  if (!owner) return unauthorized();
  const parsed = createHabitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  const last = await prisma.habit.findFirst({
    where: owner,
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const clock = israelClock(new Date());
  const habit = await prisma.habit.create({
    data: {
      ...owner,
      ...parsed.data,
      startDate: ymdToDate(clock.today),
      // Created after today's time: don't fire a reminder for it right away.
      lastNotifiedOn: clock.minutes >= parsed.data.timeMinutes ? ymdToDate(clock.today) : null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ success: true, data: serializeHabit(habit) }, { status: 201 });
}
