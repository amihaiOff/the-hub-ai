import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { reorderHabitsSchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { getHabitOwner } from '@/lib/habits/owner';

/** POST /api/habits/reorder — `ids` is the full active list in its new order. */
export async function POST(request: NextRequest) {
  const owner = await getHabitOwner();
  if (!owner) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const parsed = reorderHabitsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { ids } = parsed.data;
  const found = await prisma.habit.count({ where: { id: { in: ids }, ...owner } });
  if (found !== new Set(ids).size || found !== ids.length) {
    return NextResponse.json({ success: false, error: 'Habit not found' }, { status: 404 });
  }
  // Interactive transaction + single updates: updateMany / the array form
  // misbehave on the Neon adapter (see task-categories/reorder).
  await prisma.$transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.habit.update({ where: { id }, data: { sortOrder: index } });
    }
  });
  return NextResponse.json({ success: true });
}
