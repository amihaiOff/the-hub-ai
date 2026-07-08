import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/budget/categorization-logs
 * Recent AI categorization queries for the household (newest first).
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const logs = await prisma.budgetCategorizationLog.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    data: logs.map((l) => ({
      id: l.id,
      transactionName: l.transactionName,
      status: l.status,
      resultCategoryName: l.resultCategoryName,
      confidence: l.confidence,
      reasoning: l.reasoning,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
