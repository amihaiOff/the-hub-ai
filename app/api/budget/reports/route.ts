import { NextResponse, after } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { findStuckReports, triggerContinue } from '@/lib/budget-report/generate';

/**
 * GET /api/budget/reports
 * Months that have a report, newest first. Also the automatic recovery path:
 * a report stuck in "generating" (its hand-off to the next run was lost) is
 * resumed from its saved progress. The Budget layout calls this on every
 * Budget page, so no extra cron is needed.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const householdId = context.activeHousehold.id;

  const stuck = await findStuckReports(householdId);
  if (stuck.length) after(() => Promise.all(stuck.map(triggerContinue)));

  const reports = await prisma.budgetReport.findMany({
    where: { householdId },
    select: { month: true, status: true, runCount: true, reportError: true, updatedAt: true },
    orderBy: { month: 'desc' },
  });
  return NextResponse.json({ success: true, data: reports });
}
