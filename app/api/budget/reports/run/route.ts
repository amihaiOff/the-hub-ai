import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { monthSchema } from '@/lib/budget-report/shared';
import { STUCK_MS, createReport, triggerContinue } from '@/lib/budget-report/generate';
import { lastClosedMonth, shiftMonth } from '@/lib/budget-report/compute';

const MAX_MONTHS_BACK = 24;

const bodySchema = z.object({ month: monthSchema });

/**
 * POST /api/budget/reports/run  { month }
 * Generate (or regenerate) the report for a closed cycle. The numbers are
 * saved before this returns; the agent then runs in its own invocations
 * (POST /api/budget/reports/continue), so the tab polls until it's ready.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { month } = parsed.data;
  const householdId = context.activeHousehold.id;

  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { billingCycleStartDay: true },
  });
  const latest = lastClosedMonth(new Date(), household.billingCycleStartDay);
  // Each run bills the AI; don't let a typo start one on years-old (empty) data.
  if (month < shiftMonth(latest, MAX_MONTHS_BACK)) {
    return NextResponse.json(
      { success: false, error: `Reports go back at most ${MAX_MONTHS_BACK} months.` },
      { status: 400 }
    );
  }
  if (month > latest) {
    return NextResponse.json(
      { success: false, error: "That cycle hasn't finished yet." },
      { status: 400 }
    );
  }

  const existing = await prisma.budgetReport.findUnique({
    where: { householdId_month: { householdId, month } },
    select: { status: true, updatedAt: true },
  });
  if (existing?.status === 'generating' && Date.now() - existing.updatedAt.getTime() < STUCK_MS) {
    return NextResponse.json(
      { success: false, error: 'This report is already being generated.' },
      { status: 409 }
    );
  }

  const report = await createReport(householdId, month);
  after(() => triggerContinue(report.id));
  return NextResponse.json({ success: true, data: report }, { status: 202 });
}
