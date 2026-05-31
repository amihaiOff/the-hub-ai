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
  ALL: 0,
};

/**
 * GET /api/moneytor/accounts/history?range=1Y
 * Daily timeseries of Moneytor account balances per (productId).
 * Returns both `points` (aggregate balance per date — sum of all accounts) and
 * per-account series so the dashboard can render sparklines.
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

    const snapshots = await prisma.moneytorAccountSnapshot.findMany({
      where,
      orderBy: { snapshotDate: 'asc' },
      select: {
        snapshotDate: true,
        productId: true,
        form: true,
        name: true,
        balanceInBase: true,
      },
    });

    const perAccount = new Map<string, { name: string; form: string; days: Map<string, number> }>();
    for (const s of snapshots) {
      const dateKey = s.snapshotDate.toISOString().split('T')[0];
      let entry = perAccount.get(s.productId);
      if (!entry) {
        entry = { name: s.name, form: s.form, days: new Map() };
        perAccount.set(s.productId, entry);
      }
      entry.days.set(dateKey, Number(s.balanceInBase));
    }

    const accounts = Array.from(perAccount.entries()).map(([productId, entry]) => ({
      productId,
      name: entry.name,
      form: entry.form,
      points: Array.from(entry.days.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // Aggregate: sum of all account balances per date (covers any date that appears anywhere).
    const allDates = new Set<string>();
    for (const a of accounts) for (const p of a.points) allDates.add(p.date);
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
    console.error('Moneytor accounts history failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load accounts history. Check server logs.' },
      { status: 500 }
    );
  }
}
