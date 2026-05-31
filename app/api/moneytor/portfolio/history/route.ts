import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

const RANGE_DAYS: Record<string, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
  ALL: 0, // 0 means no lower bound
};

/**
 * GET /api/moneytor/portfolio/history?range=1Y
 * Returns a per-day total value timeseries built from moneytor_stock_snapshots.
 * Each point = sum of totalWorthInBase + accountCash across all snapshots on that date.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const range = request.nextUrl.searchParams.get('range') ?? '1Y';
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['1Y'];

    const where: { householdId: string; snapshotDate?: { gte: Date } } = { householdId };
    if (days > 0) {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      since.setUTCHours(0, 0, 0, 0);
      where.snapshotDate = { gte: since };
    }

    const snapshots = await prisma.moneytorStockSnapshot.findMany({
      where,
      orderBy: { snapshotDate: 'asc' },
      select: {
        snapshotDate: true,
        productId: true,
        totalWorthInBase: true,
        accountCash: true,
      },
    });

    // Per-account aggregation: each holding row contributes totalWorthInBase, and cash
    // is recorded once per (date, productId) since accountCash is duplicated across
    // every holding row on that snapshot date.
    const perAccount = new Map<string, Map<string, { holdings: number; cash: number }>>();

    for (const s of snapshots) {
      const dateKey = s.snapshotDate.toISOString().split('T')[0];
      let acctMap = perAccount.get(s.productId);
      if (!acctMap) {
        acctMap = new Map();
        perAccount.set(s.productId, acctMap);
      }
      let day = acctMap.get(dateKey);
      if (!day) {
        day = { holdings: 0, cash: 0 };
        acctMap.set(dateKey, day);
      }
      day.holdings += Number(s.totalWorthInBase);
      // Cash from any holding row in this account/day is the same value — taking max
      // (or last) handles the duplication idempotently.
      if (s.accountCash != null) {
        day.cash = Number(s.accountCash);
      }
    }

    const accounts = Array.from(perAccount.entries()).map(([productId, days]) => ({
      productId,
      points: Array.from(days.entries())
        .map(([date, d]) => ({ date, value: d.holdings + d.cash }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // Total points: sum across accounts for each date that appears anywhere
    const allDates = new Set<string>();
    for (const a of accounts) {
      for (const p of a.points) allDates.add(p.date);
    }
    const points = Array.from(allDates)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => ({
        date,
        value: accounts.reduce(
          (s, a) => s + (a.points.find((p) => p.date === date)?.value ?? 0),
          0
        ),
      }));

    return NextResponse.json({ ok: true, range, points, accounts });
  } catch (err) {
    console.error('Moneytor portfolio history failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load portfolio history. Check server logs.' },
      { status: 500 }
    );
  }
}
