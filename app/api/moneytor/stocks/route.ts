import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/stocks
 * Returns all stock holdings synced from Moneytor for the active household,
 * grouped by Moneytor account (productId/accountName).
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const rows = await prisma.moneytorStockHolding.findMany({
      where: { householdId },
      orderBy: [{ accountName: 'asc' }, { stockName: 'asc' }],
    });

    const accounts = new Map<
      string,
      {
        productId: string;
        accountName: string;
        broker: string | null;
        cash: number | null;
        totalValue: number;
        holdings: Array<{
          id: string;
          stockName: string;
          amount: number;
          purchasePrice: number | null;
          purchaseDate: string | null;
          stockPrice: number;
          currency: string;
          totalWorthInBase: number;
        }>;
      }
    >();

    for (const r of rows) {
      const acct = accounts.get(r.productId) ?? {
        productId: r.productId,
        accountName: r.accountName,
        broker: r.broker,
        cash: r.accountCash ? Number(r.accountCash) : null,
        totalValue: 0,
        holdings: [],
      };
      const totalWorth = Number(r.totalWorthInBase);
      acct.totalValue += totalWorth;
      acct.holdings.push({
        id: r.id,
        stockName: r.stockName,
        amount: Number(r.amount),
        purchasePrice: r.purchasePrice ? Number(r.purchasePrice) : null,
        purchaseDate: r.purchaseDate ? r.purchaseDate.toISOString().split('T')[0] : null,
        stockPrice: Number(r.stockPrice),
        currency: r.currency,
        totalWorthInBase: totalWorth,
      });
      accounts.set(r.productId, acct);
    }

    return NextResponse.json({
      ok: true,
      accounts: Array.from(accounts.values()),
    });
  } catch (err) {
    console.error('Moneytor stocks list failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load stocks. Check server logs.' },
      { status: 500 }
    );
  }
}
