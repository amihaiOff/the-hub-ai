import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/portfolio
 * Returns Moneytor stock holdings in the PortfolioSummary shape consumed by /portfolio.
 * All account totals are reported in ILS (Moneytor's base currency). Per-holding
 * stockPrice and avgCostBasis are in the stock's native currency (rendered as bare numbers
 * by the page), while currentValue / gainLoss roll up in ILS.
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

    const accountsByProduct = new Map<
      string,
      {
        id: string;
        name: string;
        broker: string | null;
        currency: string;
        totalValue: number;
        totalHoldingsValue: number;
        totalCash: number;
        totalCostBasis: number;
        totalGainLoss: number;
        totalGainLossPercent: number;
        holdings: Array<{
          id: string;
          symbol: string;
          name: string | null;
          quantity: number;
          avgCostBasis: number;
          currentPrice: number;
          currentValue: number;
          costBasis: number;
          gainLoss: number;
          gainLossPercent: number;
        }>;
        cashBalances: Array<{
          id: string;
          currency: string;
          amount: number;
          convertedAmount: number;
        }>;
        owners: never[];
      }
    >();

    for (const r of rows) {
      const totalWorthInBase = Number(r.totalWorthInBase);
      const stockPrice = Number(r.stockPrice);
      const purchasePrice = r.purchasePrice ? Number(r.purchasePrice) : 0;
      const amount = Number(r.amount);

      // Gain/loss derived from price ratio so it works across currencies — we don't
      // have a base-currency cost basis from Moneytor, so back it out from the ratio.
      const costBasisInBase =
        purchasePrice > 0 && stockPrice > 0
          ? totalWorthInBase * (purchasePrice / stockPrice)
          : totalWorthInBase;
      const gainLoss = totalWorthInBase - costBasisInBase;
      const gainLossPercent = purchasePrice > 0 ? (stockPrice / purchasePrice - 1) * 100 : 0;

      let acct = accountsByProduct.get(r.productId);
      if (!acct) {
        const cash = r.accountCash ? Number(r.accountCash) : 0;
        acct = {
          id: r.productId,
          name: r.accountName,
          broker: r.broker,
          currency: 'ILS',
          totalValue: 0,
          totalHoldingsValue: 0,
          totalCash: cash,
          totalCostBasis: 0,
          totalGainLoss: 0,
          totalGainLossPercent: 0,
          holdings: [],
          cashBalances:
            cash > 0
              ? [
                  {
                    id: `cash-${r.productId}`,
                    currency: 'ILS',
                    amount: cash,
                    convertedAmount: cash,
                  },
                ]
              : [],
          owners: [],
        };
        accountsByProduct.set(r.productId, acct);
      }

      acct.holdings.push({
        id: r.id,
        symbol: r.stockName,
        name: null,
        quantity: amount,
        avgCostBasis: purchasePrice,
        currentPrice: stockPrice,
        currentValue: totalWorthInBase,
        costBasis: costBasisInBase,
        gainLoss,
        gainLossPercent,
      });
      acct.totalHoldingsValue += totalWorthInBase;
      acct.totalCostBasis += costBasisInBase;
      acct.totalGainLoss += gainLoss;
    }

    const accounts = Array.from(accountsByProduct.values()).map((a) => {
      a.totalValue = a.totalHoldingsValue + a.totalCash;
      a.totalGainLossPercent =
        a.totalCostBasis > 0 ? (a.totalGainLoss / a.totalCostBasis) * 100 : 0;
      return a;
    });

    const totalHoldingsValue = accounts.reduce((s, a) => s + a.totalHoldingsValue, 0);
    const totalCash = accounts.reduce((s, a) => s + a.totalCash, 0);
    const totalCostBasis = accounts.reduce((s, a) => s + a.totalCostBasis, 0);
    const totalGainLoss = accounts.reduce((s, a) => s + a.totalGainLoss, 0);
    const totalHoldings = accounts.reduce((s, a) => s + a.holdings.length, 0);

    return NextResponse.json({
      ok: true,
      totalValue: totalHoldingsValue + totalCash,
      totalHoldingsValue,
      totalCash,
      totalCostBasis,
      totalGainLoss,
      totalGainLossPercent: totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0,
      totalHoldings,
      accounts,
    });
  } catch (err) {
    console.error('Moneytor portfolio failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load portfolio. Check server logs.' },
      { status: 500 }
    );
  }
}
