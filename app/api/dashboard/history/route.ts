import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import {
  calculatePortfolioSummary,
  convertSummaryToILS,
  HoldingWithPrice,
} from '@/lib/utils/portfolio';
import { fetchExchangeRates, convertPrice } from '@/lib/api/exchange-rates';

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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Fetch snapshots and compute current values in parallel
    const [snapshots, current] = await Promise.all([
      prisma.netWorthSnapshot.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 24,
      }),
      computeCurrentValues(userId),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayPoint: NetWorthDataPoint = {
      date: todayStr,
      netWorth: Math.round(current.netWorth),
      portfolio: Math.round(current.portfolio),
      pension: Math.round(current.pension),
      assets: Math.round(current.assets),
    };

    if (snapshots.length > 0) {
      // Reverse to chronological order (oldest to newest)
      const history: NetWorthDataPoint[] = snapshots.reverse().map((snapshot) => ({
        date: snapshot.date.toISOString().split('T')[0],
        netWorth: Number(snapshot.netWorth),
        portfolio: Number(snapshot.portfolio),
        pension: Number(snapshot.pension),
        assets: Number(snapshot.assets),
      }));

      // Replace or append today's data point with real-time values
      const lastIdx = history.length - 1;
      if (history[lastIdx].date === todayStr) {
        history[lastIdx] = todayPoint;
      } else {
        history.push(todayPoint);
      }

      return NextResponse.json({
        success: true,
        data: history,
      });
    }

    // Fall back to generated mock data if no snapshots exist
    const history = generateMockHistory(
      current.netWorth,
      current.portfolio,
      current.pension,
      current.assets
    );

    return NextResponse.json({
      success: true,
      data: history,
    });
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
async function computeCurrentValues(userId: string) {
  const [stockAccounts, pensionAccounts, miscAssets] = await Promise.all([
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
  const portfolio = portfolioSummary.totalValue;

  const pension = pensionAccounts.reduce((sum, acc) => sum + Number(acc.currentValue), 0);

  let assets = 0;
  for (const asset of miscAssets) {
    assets += Number(asset.currentValue);
  }

  return {
    portfolio,
    pension,
    assets,
    netWorth: portfolio + pension + assets,
  };
}

/**
 * Generate deterministic mock historical data.
 * Uses current values and works backwards with smooth growth curves.
 * Only used when no real snapshots exist yet.
 */
function generateMockHistory(
  currentNetWorth: number,
  currentPortfolio: number,
  currentPension: number,
  currentAssets: number
): NetWorthDataPoint[] {
  const history: NetWorthDataPoint[] = [];
  const now = new Date();

  // Generate data points for the past 12 months (bi-weekly = 24 points)
  for (let i = 23; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 14); // Every 2 weeks

    const monthsAgo = i * 0.5;
    const portfolioGrowthFactor = Math.pow(1.08, -monthsAgo / 12);
    const pensionGrowthFactor = Math.pow(1.06, -monthsAgo / 12);

    const portfolio = Math.round(currentPortfolio * portfolioGrowthFactor);
    const pension = Math.round(currentPension * pensionGrowthFactor);
    const assets = Math.round(currentAssets);
    const netWorth = portfolio + pension + assets;

    history.push({
      date: date.toISOString().split('T')[0],
      netWorth,
      portfolio,
      pension,
      assets,
    });
  }

  // Ensure the last data point matches current values exactly
  if (history.length > 0) {
    history[history.length - 1] = {
      date: now.toISOString().split('T')[0],
      netWorth: Math.round(currentNetWorth),
      portfolio: Math.round(currentPortfolio),
      pension: Math.round(currentPension),
      assets: Math.round(currentAssets),
    };
  }

  return history;
}
