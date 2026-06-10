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

/**
 * GET /api/dashboard
 * Get aggregated dashboard data: net worth from stocks, pension, and assets
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = context.user.id;
    const householdId = context.activeHousehold?.id ?? null;

    // Fetch all data in parallel
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

    // Calculate stock portfolio value
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

        // Convert price to account currency if needed (e.g., GBP-listed stock in USD account)
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
    // Convert portfolio totals to ILS so they can be summed with pension/assets (also in ILS)
    if (!rates) {
      console.warn('Exchange rates unavailable, dashboard net worth may mix currencies');
    }
    const portfolioSummary = rates ? convertSummaryToILS(rawSummary, rates) : rawSummary;

    // Calculate pension totals (manual + Moneytor)
    const manualPensionTotal = pensionAccounts.reduce(
      (sum, acc) => sum + Number(acc.currentValue),
      0
    );
    const pensionTotal = manualPensionTotal + moneytor.pension;

    // Calculate assets totals (manual + Moneytor banks/debts)
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
    assetsTotal += moneytor.assetsPositive;
    liabilitiesTotal += moneytor.assetsNegative;
    const assetsNetValue = assetsTotal - liabilitiesTotal;

    // Portfolio: manual is gain/loss aware; Moneytor stock holdings ship a flat
    // `totalWorthInBase` (no cost basis), so we just add their value to the
    // total. Gain/loss numbers shown to the user reflect only the manual side.
    const portfolioTotalValue = portfolioSummary.totalValue + moneytor.portfolio;

    const netWorth = portfolioTotalValue + pensionTotal + assetsNetValue;

    return NextResponse.json({
      success: true,
      data: {
        netWorth,
        portfolio: {
          totalValue: portfolioTotalValue,
          totalGain: portfolioSummary.totalGainLoss,
          totalGainPercent: portfolioSummary.totalGainLossPercent,
          holdingsCount: portfolioSummary.totalHoldings + moneytor.portfolioHoldingsCount,
        },
        pension: {
          totalValue: pensionTotal,
          accountsCount: pensionAccounts.length + moneytor.pensionFundsCount,
        },
        assets: {
          totalAssets: assetsTotal,
          totalLiabilities: liabilitiesTotal,
          netValue: assetsNetValue,
          itemsCount: miscAssets.length + moneytor.accountsCount,
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
