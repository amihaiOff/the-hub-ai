import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { computeCost, type UsageCounts } from '@/lib/ai/pricing';

/**
 * GET /api/labs/ai-usage/days?month=YYYY-MM
 * Per-day AI auto-categorization spend for a single calendar month in the
 * active household, aggregated from budget_categorization_logs. Powers the
 * expandable per-month row on the Labs → AI Spend page.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ success: false, error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  const rows = await prisma.budgetCategorizationLog.findMany({
    where: {
      householdId: context.activeHousehold.id,
      createdAt: { gte: start, lt: end },
      inputTokens: { not: null },
    },
    select: {
      createdAt: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      webSearches: true,
    },
  });

  const emptyUsage = (): UsageCounts => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    webSearches: 0,
  });

  const byDay = new Map<string, { usage: UsageCounts; count: number }>();
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    const bucket = byDay.get(key) ?? { usage: emptyUsage(), count: 0 };
    bucket.usage.inputTokens += r.inputTokens ?? 0;
    bucket.usage.outputTokens += r.outputTokens ?? 0;
    bucket.usage.cacheCreationTokens += r.cacheCreationTokens ?? 0;
    bucket.usage.cacheReadTokens += r.cacheReadTokens ?? 0;
    bucket.usage.webSearches += r.webSearches ?? 0;
    bucket.count += 1;
    byDay.set(key, bucket);
  }

  // Return days that actually had activity, ordered by day ascending.
  const days = Array.from(byDay.entries())
    .map(([day, bucket]) => ({
      day,
      transactionCount: bucket.count,
      spendUsd: computeCost(bucket.usage).totalUsd,
      webSearches: bucket.usage.webSearches,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({ success: true, data: { month, days } });
}
