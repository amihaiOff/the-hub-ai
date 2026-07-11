import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { computeCost, AI_PRICING, type UsageCounts } from '@/lib/ai/pricing';

/**
 * GET /api/labs/ai-usage
 * Aggregates AI auto-categorization spend for the active household from the
 * per-transaction usage recorded on budget_categorization_logs. Returns the
 * current calendar month broken down by cost component (input / output / cache
 * write / cache read / web search), the average cost per categorized
 * transaction, and a short per-month history for context.
 *
 * Cost is derived from the stored token/search counts via lib/ai/pricing.ts,
 * so it always reflects the current rate table.
 */

const MONTHS_BACK = 6;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const currentMonthKey = monthKey(now);

  // Only rows that actually recorded usage (a model call happened). Error rows
  // and pre-tracking rows have null token counts and are excluded from cost.
  const rows = await prisma.budgetCategorizationLog.findMany({
    where: {
      householdId: context.activeHousehold.id,
      createdAt: { gte: windowStart },
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

  // Aggregate per month.
  const byMonth = new Map<string, { usage: UsageCounts; count: number }>();
  const emptyUsage = (): UsageCounts => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    webSearches: 0,
  });

  for (const r of rows) {
    const key = monthKey(r.createdAt);
    const bucket = byMonth.get(key) ?? { usage: emptyUsage(), count: 0 };
    bucket.usage.inputTokens += r.inputTokens ?? 0;
    bucket.usage.outputTokens += r.outputTokens ?? 0;
    bucket.usage.cacheCreationTokens += r.cacheCreationTokens ?? 0;
    bucket.usage.cacheReadTokens += r.cacheReadTokens ?? 0;
    bucket.usage.webSearches += r.webSearches ?? 0;
    bucket.count += 1;
    byMonth.set(key, bucket);
  }

  // Build the last MONTHS_BACK month keys (oldest → newest), filling gaps.
  const months: { month: string; spendUsd: number; transactionCount: number }[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const bucket = byMonth.get(key);
    months.push({
      month: key,
      spendUsd: bucket ? computeCost(bucket.usage).totalUsd : 0,
      transactionCount: bucket?.count ?? 0,
    });
  }

  const current = byMonth.get(currentMonthKey) ?? { usage: emptyUsage(), count: 0 };
  const breakdown = computeCost(current.usage);

  return NextResponse.json({
    success: true,
    data: {
      currency: 'USD',
      currentMonth: {
        month: currentMonthKey,
        spendUsd: breakdown.totalUsd,
        transactionCount: current.count,
        avgCostUsd: current.count > 0 ? breakdown.totalUsd / current.count : 0,
        tokens: {
          input: current.usage.inputTokens,
          output: current.usage.outputTokens,
          cacheCreation: current.usage.cacheCreationTokens,
          cacheRead: current.usage.cacheReadTokens,
          webSearches: current.usage.webSearches,
        },
        breakdown,
      },
      months,
      pricing: AI_PRICING,
    },
  });
}
