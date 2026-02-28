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

/**
 * GET /api/portfolio
 * Get user's portfolio with all accounts and holdings
 */
export async function GET() {
  try {
    // Get current user (dev user in local mode, or authenticated user in production)
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // Fetch all accounts with holdings, cash balances, and owners for the user
    const accounts = await prisma.stockAccount.findMany({
      where: { userId },
      include: {
        holdings: true,
        cashBalances: true,
        owners: {
          include: {
            profile: {
              select: {
                id: true,
                name: true,
                image: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get all unique symbols across all holdings
    const allSymbols = new Set<string>();
    for (const account of accounts) {
      for (const holding of account.holdings) {
        allSymbols.add(holding.symbol);
      }
    }

    // Fetch prices and exchange rates in parallel
    const [prices, rates] = await Promise.all([
      getStockPrices(Array.from(allSymbols)),
      fetchExchangeRates(),
    ]);

    // Transform accounts to include current prices, cash balances, and owners
    const accountsWithPrices = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      broker: account.broker,
      currency: account.currency,
      holdings: account.holdings.map((holding) => {
        const priceResult = prices.get(holding.symbol);
        const fetchedPrice = priceResult && !isStockPriceError(priceResult) ? priceResult.price : 0;
        // Get the currency the price is quoted in (for dual-listed stocks like EIMI.L in GBP)
        const fetchedPriceCurrency =
          priceResult && !isStockPriceError(priceResult) ? priceResult.currency : account.currency;

        // Convert price to account currency if needed
        // This ensures gains/losses are calculated in the account's native currency
        let currentPrice = fetchedPrice;
        let originalPrice: number | undefined;
        let originalPriceCurrency: string | undefined;

        if (rates && fetchedPriceCurrency !== account.currency && fetchedPrice > 0) {
          // Price needs conversion - store original for display
          originalPrice = fetchedPrice;
          originalPriceCurrency = fetchedPriceCurrency;
          currentPrice = convertPrice(fetchedPrice, fetchedPriceCurrency, account.currency, rates);
        }

        return {
          id: holding.id,
          symbol: holding.symbol,
          name: holding.name,
          taseSymbol: holding.taseSymbol,
          quantity: holding.quantity,
          avgCostBasis: holding.avgCostBasis,
          currentPrice,
          originalPrice,
          originalPriceCurrency,
        } as HoldingWithPrice;
      }),
      // Include cash balances, converting to account currency if needed
      cashBalances: account.cashBalances.map((cash) => {
        const amount = Number(cash.amount);
        // Convert cash to account currency if it's in a different currency
        let convertedAmount = amount;
        if (rates && cash.currency !== account.currency && amount > 0) {
          convertedAmount = convertPrice(amount, cash.currency, account.currency, rates);
        }
        return {
          id: cash.id,
          currency: cash.currency,
          amount,
          convertedAmount,
        };
      }),
      owners: account.owners.map((o) => ({
        id: o.profile.id,
        name: o.profile.name,
        image: o.profile.image,
        color: o.profile.color,
      })),
    }));

    // Calculate portfolio summary (account-level values in native currency)
    const rawSummary = calculatePortfolioSummary(accountsWithPrices);

    // Convert top-level totals to ILS so we don't mix currencies when summing
    if (!rates) {
      console.warn('Exchange rates unavailable, portfolio totals may mix currencies');
    }
    const summary = rates ? convertSummaryToILS(rawSummary, rates) : rawSummary;

    return NextResponse.json({
      success: true,
      data: {
        userId,
        baseCurrency: 'ILS',
        ...summary,
      },
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch portfolio' },
      { status: 500 }
    );
  }
}
