import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { calculatePortfolioSummary, HoldingWithPrice } from '@/lib/utils/portfolio';

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
 * Uses database snapshots when available, falls back to generated mock data
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Try to fetch real snapshots from database first
    // Get latest 24 snapshots (order desc to get most recent, then reverse for chronological display)
    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 24,
    });

    // If we have snapshots, use them
    if (snapshots.length > 0) {
      // Reverse to get chronological order (oldest to newest) for the chart
      const history: NetWorthDataPoint[] = snapshots.reverse().map((snapshot) => ({
        date: snapshot.date.toISOString().split('T')[0],
        netWorth: Number(snapshot.netWorth),
        portfolio: Number(snapshot.portfolio),
        pension: Number(snapshot.pension),
        assets: Number(snapshot.assets),
      }));

      return NextResponse.json({
        success: true,
        data: history,
      });
    }

    // Fall back to generated mock data if no snapshots exist
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

    // Calculate current portfolio value
    const allSymbols = new Set<string>();
    for (const account of stockAccounts) {
      for (const holding of account.holdings) {
        allSymbols.add(holding.symbol);
      }
    }

    const prices = await getStockPrices(Array.from(allSymbols));

    const accountsWithPrices = stockAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      broker: account.broker,
      currency: account.currency,
      holdings: account.holdings.map((holding) => {
        const priceResult = prices.get(holding.symbol);
        const currentPrice = priceResult && !isStockPriceError(priceResult) ? priceResult.price : 0;
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

    const portfolioSummary = calculatePortfolioSummary(accountsWithPrices);
    const currentPortfolio = portfolioSummary.totalValue;

    // Calculate current pension and assets
    const currentPension = pensionAccounts.reduce((sum, acc) => sum + Number(acc.currentValue), 0);

    let currentAssets = 0;
    for (const asset of miscAssets) {
      currentAssets += Number(asset.currentValue);
    }

    const currentNetWorth = currentPortfolio + currentPension + currentAssets;

    // Generate mock historical data for the past 12 months
    const history = generateMockHistory(
      currentNetWorth,
      currentPortfolio,
      currentPension,
      currentAssets
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
 * Generate mock historical data with realistic variations
 * Uses current values and works backwards with random fluctuations
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

    // Calculate historical values with realistic growth patterns
    // Assume ~8% annual growth for portfolio, ~6% for pension, assets relatively stable
    const monthsAgo = i * 0.5;
    const portfolioGrowthFactor = Math.pow(1.08, -monthsAgo / 12);
    const pensionGrowthFactor = Math.pow(1.06, -monthsAgo / 12);

    // Add some random variation (±5% noise)
    const portfolioNoise = 1 + (Math.random() - 0.5) * 0.1;
    const pensionNoise = 1 + (Math.random() - 0.5) * 0.04;
    const assetsNoise = 1 + (Math.random() - 0.5) * 0.02;

    const portfolio = Math.round(currentPortfolio * portfolioGrowthFactor * portfolioNoise);
    const pension = Math.round(currentPension * pensionGrowthFactor * pensionNoise);
    const assets = Math.round(currentAssets * assetsNoise);
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
