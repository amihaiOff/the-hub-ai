import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { habitLogsQuerySchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { getHabitOwner } from '@/lib/habits/owner';
import { dateToYmd, ymdToDate } from '@/lib/habits/serialize';

/** GET /api/habits/logs?from&to — the user's answers in a calendar range (archived habits too). */
export async function GET(request: NextRequest) {
  const owner = await getHabitOwner();
  if (!owner) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const parsed = habitLogsQuerySchema.safeParse({ from: sp.get('from'), to: sp.get('to') });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  const logs = await prisma.habitLog.findMany({
    where: {
      habit: owner,
      date: { gte: ymdToDate(parsed.data.from), lte: ymdToDate(parsed.data.to) },
    },
    select: { habitId: true, date: true, status: true },
  });
  return NextResponse.json({
    success: true,
    data: logs.map((l) => ({ habitId: l.habitId, date: dateToYmd(l.date), status: l.status })),
  });
}
