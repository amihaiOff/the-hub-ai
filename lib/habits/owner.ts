import { getCurrentContext } from '@/lib/auth-utils';

/** Habits are personal: every route scopes to the signed-in user in the active household. */
export async function getHabitOwner() {
  const context = await getCurrentContext();
  if (!context) return null;
  return { householdId: context.activeHousehold.id, ownerId: context.user.id };
}
