import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { monthSchema } from '@/lib/budget-report/shared';

/** GET /api/budget/reports/[month] — the full report for one cycle. */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { month } = await params;
  if (!monthSchema.safeParse(month).success) {
    return NextResponse.json({ success: false, error: 'Invalid month' }, { status: 400 });
  }
  const report = await prisma.budgetReport.findUnique({
    where: { householdId_month: { householdId: context.activeHousehold.id, month } },
    select: {
      month: true,
      status: true,
      stats: true,
      report: true,
      reportError: true,
      model: true,
      usage: true,
      runCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!report) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: report });
}
