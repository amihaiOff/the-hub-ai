import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { reorderTaskCategoriesSchema } from '@/lib/validations/tasks';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/task-categories/reorder
 * Bulk-update the sortOrder of task categories. The order set here drives the
 * category order everywhere categories are listed (kanban grouping, pickers),
 * since those all read categories ordered by sortOrder.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const parsed = reorderTaskCategoriesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    const { categories } = parsed.data;
    const ids = categories.map((c) => c.id);

    // Ensure every category belongs to the active household.
    const existing = await prisma.taskCategory.findMany({
      where: { id: { in: ids }, householdId },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { success: false, error: 'One or more categories not found' },
        { status: 404 }
      );
    }

    // Update one at a time (Neon serverless compatibility).
    for (const c of categories) {
      await prisma.taskCategory.update({
        where: { id: c.id },
        data: { sortOrder: c.sortOrder },
      });
    }

    return NextResponse.json({ success: true, data: { updated: categories.length } });
  } catch (err) {
    console.error('Failed to reorder task categories:', err);
    return NextResponse.json({ success: false, error: 'Failed to reorder' }, { status: 500 });
  }
}
