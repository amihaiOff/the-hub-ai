import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronLog } from '@/lib/utils/cron-logger';
import { createReport, triggerContinue } from '@/lib/budget-report/generate';
import { lastClosedMonth } from '@/lib/budget-report/compute';

/**
 * GET /api/cron/budget-report — monthly, on the 12th (vercel.json): two days
 * after a cycle starting on the 10th closes. Creates the just-closed cycle's
 * report for every household with a budget and no report yet, then hands each
 * one to its own agent invocation.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    // Refuse outright if the secret is unset, rather than accepting "Bearer undefined".
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return withCronLog('/api/cron/budget-report', async () => {
    const households = await prisma.household.findMany({
      where: { budgetCategoryGroups: { some: {} } },
      select: { id: true, billingCycleStartDay: true },
    });
    const started: string[] = [];
    const failed: { householdId: string; error: string }[] = [];
    for (const h of households) {
      const month = lastClosedMonth(new Date(), h.billingCycleStartDay);
      const exists = await prisma.budgetReport.findUnique({
        where: { householdId_month: { householdId: h.id, month } },
        select: { id: true },
      });
      if (exists) continue;
      try {
        const report = await createReport(h.id, month);
        await triggerContinue(report.id);
        started.push(`${h.id}:${month}`);
      } catch (err) {
        failed.push({ householdId: h.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { body: { success: failed.length === 0, started, failed } };
  });
}
