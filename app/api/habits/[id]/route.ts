import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateHabitSchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { getHabitOwner } from '@/lib/habits/owner';
import { serializeHabit } from '@/lib/habits/serialize';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status });

/** PATCH /api/habits/[id] — edit fields; `archived: true/false` archives or restores. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const owner = await getHabitOwner();
  if (!owner) return fail('Unauthorized', 401);
  const { id } = await params;
  const parsed = updateHabitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(getFirstZodError(parsed.error), 400);
  const existing = await prisma.habit.findFirst({ where: { id, ...owner } });
  if (!existing) return fail('Not found', 404);

  const { archived, ...fields } = parsed.data;
  const habit = await prisma.habit.update({
    where: { id },
    data: {
      ...fields,
      // Restore keeps the original start date (and so the every-N-weeks rhythm)
      // and the old position in the list.
      ...(archived !== undefined && {
        // Re-archiving keeps the original date (scheduling stops from it).
        archivedAt: archived ? (existing.archivedAt ?? new Date()) : null,
      }),
    },
  });
  return NextResponse.json({ success: true, data: serializeHabit(habit) });
}

/** DELETE /api/habits/[id] — permanent, history included. Only from the archive. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const owner = await getHabitOwner();
  if (!owner) return fail('Unauthorized', 401);
  const { id } = await params;
  const existing = await prisma.habit.findFirst({ where: { id, ...owner } });
  if (!existing) return fail('Not found', 404);
  if (!existing.archivedAt) return fail('Archive the habit before deleting it', 409);
  await prisma.habit.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
