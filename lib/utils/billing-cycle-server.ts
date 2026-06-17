/**
 * Server-only helper: load a household's billing-cycle start day and
 * convert a YYYY-MM month string into a [from, to) date range.
 *
 * Lives in its own file so we can import it from API routes without
 * pulling Prisma into the pure helper module `billing-cycle.ts` (which
 * is consumed by both server and client code).
 */

import { prisma } from '@/lib/db';
import { monthToCycleRange, type CycleRange } from './billing-cycle';

export async function getCycleRangeForHousehold(
  householdId: string,
  month: string
): Promise<CycleRange> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { billingCycleStartDay: true },
  });
  return monthToCycleRange(month, household?.billingCycleStartDay ?? 1);
}
