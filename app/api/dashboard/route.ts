import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { calculatePortfolioSummary, HoldingWithPrice } from '@/lib/utils/portfolio';

/**
 * GET /api/dashboard
 * Get aggregated dashboard data: net worth from stocks, pension, and assets
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Fetch all data in parallel
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

    // Calculate stock portfolio value
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

    // Calculate pension totals
    const pensionTotal = pensionAccounts.reduce((sum, acc) => sum + Number(acc.currentValue), 0);

    // Calculate assets totals
    let assetsTotal = 0;
    let liabilitiesTotal = 0;
    for (const asset of miscAssets) {
      const value = Number(asset.currentValue);
      if (value >= 0) {
        assetsTotal += value;
      } else {
        liabilitiesTotal += Math.abs(value);
      }
    }
    const assetsNetValue = assetsTotal - liabilitiesTotal;

    // Calculate total net worth
    const netWorth = portfolioSummary.totalValue + pensionTotal + assetsNetValue;

    return NextResponse.json({
      success: true,
      data: {
        netWorth,
        portfolio: {
          totalValue: portfolioSummary.totalValue,
          totalGain: portfolioSummary.totalGainLoss,
          totalGainPercent: portfolioSummary.totalGainLossPercent,
          holdingsCount: portfolioSummary.totalHoldings,
        },
        pension: {
          totalValue: pensionTotal,
          accountsCount: pensionAccounts.length,
        },
        assets: {
          totalAssets: assetsTotal,
          totalLiabilities: liabilitiesTotal,
          netValue: assetsNetValue,
          itemsCount: miscAssets.length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
