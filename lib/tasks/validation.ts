/**
 * Server-side invariants for the Tasks module that we can't express in the
 * Prisma schema.
 *
 * The two rules:
 *  1. A task's parent must itself be a top-level task (no grandchildren).
 *  2. A task with children may not be reassigned a parent (would create a
 *     two-level chain by promoting a parent to a child).
 *
 * Both raise `TaskValidationError` so API routes can map to a 400 response
 * without a bunch of `try/catch` gymnastics.
 */

import { prisma } from '@/lib/db';

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

/**
 * Reject a create/update payload that tries to make the target task a
 * sub-task of another sub-task. Also enforces household scoping — the
 * parent must live in the same household.
 */
export async function assertParentAllowed(
  parentTaskId: string | null | undefined,
  householdId: string
): Promise<void> {
  if (!parentTaskId) return;
  const parent = await prisma.task.findUnique({
    where: { id: parentTaskId },
    select: { id: true, parentTaskId: true, householdId: true },
  });
  if (!parent || parent.householdId !== householdId) {
    throw new TaskValidationError('Parent task not found in this household');
  }
  if (parent.parentTaskId !== null) {
    throw new TaskValidationError('Sub-tasks may only nest one level deep');
  }
}

/**
 * Reject converting a task that already has children into a sub-task —
 * that would create a second level of nesting via its own kids.
 * Called on PATCH when parentTaskId is being set to a non-null value.
 */
export async function assertNotConvertingParentToChild(taskId: string): Promise<void> {
  const childCount = await prisma.task.count({ where: { parentTaskId: taskId } });
  if (childCount > 0) {
    throw new TaskValidationError(
      'This task has sub-tasks and cannot be made a sub-task of another'
    );
  }
}
