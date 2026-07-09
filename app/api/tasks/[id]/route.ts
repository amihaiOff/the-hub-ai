import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateTaskSchema } from '@/lib/validations/tasks';
import { getFirstZodError } from '@/lib/validations/common';
import { canView, canEdit, isOwner } from '@/lib/tasks/permissions';
import {
  assertParentAllowed,
  assertNotConvertingParentToChild,
  TaskValidationError,
} from '@/lib/tasks/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Everything the client cares about — reused by GET/PATCH so responses are consistent.
const TASK_INCLUDE = {
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
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] as const,
  },
} satisfies Prisma.TaskInclude;

async function loadTaskInHousehold(id: string, householdId: string) {
  return prisma.task.findFirst({
    where: { id, householdId },
    include: TASK_INCLUDE,
  });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const task = await loadTaskInHousehold(id, context.activeHousehold.id);
  if (!task) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (!canView(task, context.user.id)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: task });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const existing = await loadTaskInHousehold(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (!canEdit(existing, context.user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const input = parsed.data;

    // Enforce one-level-nesting invariants on parent changes.
    if (input.parentTaskId !== undefined) {
      if (input.parentTaskId) {
        await assertParentAllowed(input.parentTaskId, context.activeHousehold.id);
        await assertNotConvertingParentToChild(id);
      }
    }

    // Build the update payload — only include keys the client sent so we
    // don't clobber other fields with undefined.
    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.status !== undefined) data.status = input.status;
    if (input.done !== undefined) data.done = input.done;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.categoryId !== undefined)
      data.category = input.categoryId
        ? { connect: { id: input.categoryId } }
        : { disconnect: true };
    if (input.assigneeId !== undefined)
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };
    if (input.parentTaskId !== undefined)
      data.parent = input.parentTaskId
        ? { connect: { id: input.parentTaskId } }
        : { disconnect: true };
    if (input.tagIds !== undefined) data.tags = { set: input.tagIds.map((tid) => ({ id: tid })) };
    if (input.customFields !== undefined) {
      data.customFields = input.customFields as unknown as Prisma.InputJsonValue;
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('Failed to update task:', err);
    return NextResponse.json({ success: false, error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await loadTaskInHousehold(id, context.activeHousehold.id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (!isOwner(existing, context.user.id)) {
      return NextResponse.json(
        { success: false, error: 'Only the owner can delete' },
        { status: 403 }
      );
    }
    // Children cascade via the FK; shares cascade too.
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete task:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete task' }, { status: 500 });
  }
}
