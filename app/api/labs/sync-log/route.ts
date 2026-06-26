import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/labs/sync-log
 * Returns the active household's last N Moneytor sync attempts (manual +
 * cron), newest first. The full MoneytorSyncSummary is included so the UI
 * can break results out per section (transactions, accounts, portfolio,
 * pension, real estate, etc.).
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.moneytorSyncLog.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: { startedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt.toISOString(),
      durationMs: r.durationMs,
      success: r.success,
      errorMessage: r.errorMessage,
      results: r.results, // raw Json — typed loosely on the client
    })),
  });
}
