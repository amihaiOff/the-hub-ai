import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTaskSchema, taskFiltersSchema } from '@/lib/validations/tasks';
import { getFirstZodError } from '@/lib/validations/common';
import { assertParentAllowed, TaskValidationError } from '@/lib/tasks/validation';

/**
 * GET /api/tasks
 * Lists tasks in the active household that are visible to the current user
 * (owned by them OR shared with them). Filters are optional query params.
 *
 * By default returns only top-level tasks — children are fetched via the
 * `include` so the Table view can expand rows without a second request.
 */
export async function GET(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const parsedFilters = taskFiltersSchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    assigneeId: searchParams.get('assigneeId') ?? undefined,
    tagId: searchParams.get('tagId') ?? undefined,
    parentTaskId: searchParams.get('parentTaskId') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });
  if (!parsedFilters.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsedFilters.error) },
      { status: 400 }
    );
  }
  const f = parsedFilters.data;

  const where: Prisma.TaskWhereInput = {
    householdId: context.activeHousehold.id,
    // Visible to me: owner OR shared with me.
    OR: [{ ownerId: context.user.id }, { shares: { some: { userId: context.user.id } } }],
  };
  if (f.status) where.status = f.status;
  if (f.priority) where.priority = f.priority;
  if (f.type) where.type = f.type;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.assigneeId) where.assigneeId = f.assigneeId;
  if (f.tagId) where.tags = { some: { id: f.tagId } };
  if (f.search) where.title = { contains: f.search, mode: 'insensitive' };
  // `parentTaskId === 'null'` (literal string) means "top-level only".
  if (f.parentTaskId === 'null') where.parentTaskId = null;
  else if (f.parentTaskId) where.parentTaskId = f.parentTaskId;
  else where.parentTaskId = null; // default: top-level only

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      category: true,
      assignee: { select: { id: true, name: true, color: true, image: true } },
      tags: true,
      shares: { select: { id: true, userId: true, canEdit: true } },
      children: {
        include: {
          category: true,
          assignee: { select: { id: true, name: true, color: true, image: true } },
          tags: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  return NextResponse.json({ success: true, data: tasks });
}

/**
 * POST /api/tasks
 * Create a task. Owner = current user, household = active household.
 * Enforces the one-level sub-task invariant (parent must be top-level).
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    await assertParentAllowed(input.parentTaskId ?? null, context.activeHousehold.id);

    const created = await prisma.task.create({
      data: {
        title: input.title,
        notes: input.notes ?? null,
        status: input.status ?? '',
        done: input.done ?? false,
        priority: input.priority ?? 'MEDIUM',
        type: input.type ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        categoryId: input.categoryId ?? null,
        assigneeId: input.assigneeId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        customFields: input.customFields
          ? (input.customFields as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ownerId: context.user.id,
        householdId: context.activeHousehold.id,
        tags: input.tagIds ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
      },
      include: {
        category: true,
        assignee: { select: { id: true, name: true, color: true, image: true } },
        tags: true,
        shares: true,
        children: true,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('Failed to create task:', err);
    return NextResponse.json({ success: false, error: 'Failed to create task' }, { status: 500 });
  }
}
