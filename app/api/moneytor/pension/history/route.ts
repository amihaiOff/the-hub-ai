import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/pension/history
 * Returns monthly snapshots grouped by month, with per-type totals for
 * charting. Each fund track has its own snapshot row per month — we sum
 * per (month, productType) so the chart has one line per type.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const rows = await prisma.moneytorPensionSnapshot.findMany({
      where: { householdId },
      orderBy: { snapshotMonth: 'asc' },
    });

    const isPension = (pt: string) => pt.includes('פנסיה');
    const isHishtalmut = (pt: string) => pt.includes('השתלמות');

    const byMonth = new Map<
      string,
      { month: string; pension: number; hishtalmut: number; total: number }
    >();
    for (const r of rows) {
      const month = r.snapshotMonth.toISOString().split('T')[0];
      const entry = byMonth.get(month) ?? {
        month,
        pension: 0,
        hishtalmut: 0,
        total: 0,
      };
      const balance = Number(r.balanceInBase);
      if (isPension(r.productType)) entry.pension += balance;
      else if (isHishtalmut(r.productType)) entry.hishtalmut += balance;
      entry.total += balance;
      byMonth.set(month, entry);
    }

    const history = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({ ok: true, history });
  } catch (err) {
    console.error('Moneytor pension history failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load pension history. Check server logs.' },
      { status: 500 }
    );
  }
}
