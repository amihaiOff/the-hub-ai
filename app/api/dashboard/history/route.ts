import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import {
  calculatePortfolioSummary,
  convertSummaryToILS,
  HoldingWithPrice,
} from '@/lib/utils/portfolio';
import { fetchExchangeRates, convertPrice } from '@/lib/api/exchange-rates';
import { getMoneytorNetWorthTotals } from '@/lib/utils/moneytor-net-worth';

export interface NetWorthDataPoint {
  date: string;
  netWorth: number;
  portfolio: number;
  pension: number;
  assets: number;
}

/**
 * GET /api/dashboard/history
 * Get net worth history data for the chart
 * Uses database snapshots when available, falls back to generated mock data.
 * Always appends a real-time "today" data point so the graph matches the dashboard cards.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = context.user.id;
    const householdId = context.activeHousehold?.id ?? null;

    // Fetch snapshots and compute current values in parallel
    const [snapshots, current] = await Promise.all([
      prisma.netWorthSnapshot.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 24,
      }),
      computeCurrentValues(userId, householdId),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayPoint: NetWorthDataPoint = {
      date: todayStr,
      netWorth: Math.round(current.netWorth),
      portfolio: Math.round(current.portfolio),
      pension: Math.round(current.pension),
      assets: Math.round(current.assets),
    };

    // Reverse to chronological order (oldest to newest). No mock backfill —
    // if the user has zero snapshots they see one point (today), which is
    // the honest picture.
    const history: NetWorthDataPoint[] = snapshots.reverse().map((snapshot) => ({
      date: snapshot.date.toISOString().split('T')[0],
      netWorth: Number(snapshot.netWorth),
      portfolio: Number(snapshot.portfolio),
      pension: Number(snapshot.pension),
      assets: Number(snapshot.assets),
    }));

    // Append or replace with today's real-time datapoint. When the newest
    // stored snapshot is already the current month's, overwrite it so the
    // "today" value stays consistent with the dashboard cards.
    const currentMonthStr = `${todayStr.slice(0, 7)}-01`;
    const lastIdx = history.length - 1;
    if (lastIdx >= 0 && history[lastIdx].date === currentMonthStr) {
      history[lastIdx] = { ...todayPoint, date: currentMonthStr };
    } else {
      history.push({ ...todayPoint, date: currentMonthStr });
    }

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching net worth history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch net worth history' },
      { status: 500 }
    );
  }
}

/**
 * Compute current net worth breakdown in ILS.
 * Mirrors the dashboard API calculation to ensure consistency.
 */
async function computeCurrentValues(userId: string, householdId: string | null) {
  const [stockAccounts, pensionAccounts, miscAssets, moneytor] = await Promise.all([
    prisma.stockAccount.findMany({
      where: { userId },
      include: { holdings: true },
    }),
    prisma.pensionAccount.findMany({
      where: { userId },
    }),
    prisma.miscAsset.findMany({
      where: { userId },
    }),
    getMoneytorNetWorthTotals(householdId),
  ]);

  const allSymbols = new Set<string>();
  for (const account of stockAccounts) {
    for (const holding of account.holdings) {
      allSymbols.add(holding.symbol);
    }
  }

  const [prices, rates] = await Promise.all([
    getStockPrices(Array.from(allSymbols)),
    fetchExchangeRates(),
  ]);

  const accountsWithPrices = stockAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    broker: account.broker,
    currency: account.currency,
    holdings: account.holdings.map((holding) => {
      const priceResult = prices.get(holding.symbol);
      const fetchedPrice = priceResult && !isStockPriceError(priceResult) ? priceResult.price : 0;
      const fetchedPriceCurrency =
        priceResult && !isStockPriceError(priceResult) ? priceResult.currency : account.currency;

      let currentPrice = fetchedPrice;
      if (rates && fetchedPriceCurrency !== account.currency && fetchedPrice > 0) {
        currentPrice = convertPrice(fetchedPrice, fetchedPriceCurrency, account.currency, rates);
      }

      return {
        id: holding.id,
        symbol: holding.symbol,
        quantity: holding.quantity,
        avgCostBasis: holding.avgCostBasis,
        currentPrice,
      } as HoldingWithPrice;
    }),
    owners: [],
  }));

  const rawSummary = calculatePortfolioSummary(accountsWithPrices);
  if (!rates) {
    console.warn('Exchange rates unavailable, history net worth may mix currencies');
  }
  const portfolioSummary = rates ? convertSummaryToILS(rawSummary, rates) : rawSummary;
  const portfolio = portfolioSummary.totalValue + moneytor.portfolio;

  const manualPension = pensionAccounts.reduce((sum, acc) => sum + Number(acc.currentValue), 0);
  const pension = manualPension + moneytor.pension;

  let assets = 0;
  for (const asset of miscAssets) {
    assets += Number(asset.currentValue);
  }
  assets += moneytor.assetsNet;

  return {
    portfolio,
    pension,
    assets,
    netWorth: portfolio + pension + assets,
  };
}
