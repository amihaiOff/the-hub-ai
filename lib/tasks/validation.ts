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
 * Reject a create/update payload that references a category, assignee or tag
 * from outside this household (or one that doesn't exist at all).
 *
 * Prisma would otherwise fail these at the FK/`connect` level, which the routes
 * can only report as a generic 500 — useless to a caller, and actively
 * misleading to an agent that needs to know its id was stale rather than that
 * the server broke. Zod already checks these are cuid-shaped; this checks they
 * are real and ours.
 *
 * Note `assigneeId` is a `Profile` id while `ownerId` is a `User` id — easy to
 * conflate, so they're looked up in different tables here.
 */
export async function assertRelationsInHousehold(
  input: {
    categoryId?: string | null;
    assigneeId?: string | null;
    tagIds?: string[];
  },
  householdId: string
): Promise<void> {
  if (input.categoryId) {
    const found = await prisma.taskCategory.count({
      where: { id: input.categoryId, householdId },
    });
    if (found === 0) throw new TaskValidationError('Unknown category for this household');
  }

  if (input.assigneeId) {
    const found = await prisma.profile.count({
      where: { id: input.assigneeId, householdMemberships: { some: { householdId } } },
    });
    if (found === 0) throw new TaskValidationError('Unknown assignee for this household');
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const ids = [...new Set(input.tagIds)];
    const found = await prisma.taskTag.count({ where: { id: { in: ids }, householdId } });
    if (found !== ids.length) throw new TaskValidationError('Unknown tag for this household');
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
