/**
 * Household-visibility Prisma `where` fragment for legacy user-owned models
 * (PensionAccount, MiscAsset — anything with `userId` + `owners: <M>Owner[]`).
 *
 * The schema comment on those `userId` columns says "Legacy - nullable during
 * migration". The go-forward ownership model is:
 *   `<M>Owner[] → Profile → HouseholdMember → Household`
 *
 * The user has confirmed the intent: pension + misc-assets should be visible
 * to every member of the active household. So a row is "visible" if EITHER:
 *   - its legacy `userId` points at a User whose Profile is in the household
 *     (covers rows created before the ownership migration), or
 *   - it has at least one Owner whose Profile is in the household (the
 *     go-forward pattern; the creating route also writes this row on POST).
 *
 * Both branches route through `HouseholdMember.householdId` so the filter
 * stays correct if a profile moves between households.
 *
 * Returned as a plain object (no `as const`) so callers can spread it into a
 * `where` clause alongside other filters like `{ id }`.
 */
export function householdVisibleWhere(householdId: string) {
  return {
    OR: [
      // Legacy: the row's creator User has a Profile in this household.
      {
        user: {
          profile: {
            householdMemberships: {
              some: { householdId },
            },
          },
        },
      },
      // Modern: at least one Owner profile is a household member.
      {
        owners: {
          some: {
            profile: {
              householdMemberships: {
                some: { householdId },
              },
            },
          },
        },
      },
    ],
  };
}
