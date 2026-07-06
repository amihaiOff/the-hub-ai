/**
 * Permission helpers for the Tasks module.
 *
 * A task is owned by exactly one User. Any User in the same household
 * can be granted access via a TaskShare row (canEdit toggles read vs write).
 * Only the owner can share/unshare or delete the task.
 *
 * These are pure functions — they take a plain task-shape argument (owner
 * + shares) so tests don't need a running database. Every API route that
 * touches a specific task funnels through {canView, canEdit, isOwner}.
 */

interface TaskShareShape {
  userId: string;
  canEdit: boolean;
}

interface TaskShape {
  ownerId: string;
  shares?: TaskShareShape[] | null;
}

export function isOwner(task: TaskShape, userId: string): boolean {
  return task.ownerId === userId;
}

export function canView(task: TaskShape, userId: string): boolean {
  if (isOwner(task, userId)) return true;
  const shares = task.shares ?? [];
  return shares.some((s) => s.userId === userId);
}

export function canEdit(task: TaskShape, userId: string): boolean {
  if (isOwner(task, userId)) return true;
  const shares = task.shares ?? [];
  return shares.some((s) => s.userId === userId && s.canEdit);
}
