/**
 * Server-only helper: load a household's billing-cycle start day and
 * convert a YYYY-MM month string into a [from, to) date range.
 *
 * Lives in its own file so we can import it from API routes without
 * pulling Prisma into the pure helper module `billing-cycle.ts` (which
 * is consumed by both server and client code).
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { monthToCycleRange, monthTransactionWhere, type CycleRange } from './billing-cycle';

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

/**
 * Payment-method-aware `where` fragment for the transactions that belong to
 * `month` — credit cards use the household billing cycle, everything else uses
 * the calendar month. See `monthTransactionWhere`. Merge into a query's `where`
 * via `AND` (it may contain its own `OR`).
 */
export async function getMonthTransactionWhereForHousehold(
  householdId: string,
  month: string
): Promise<Prisma.BudgetTransactionWhereInput> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { billingCycleStartDay: true },
  });
  return monthTransactionWhere(month, household?.billingCycleStartDay ?? 1);
}
