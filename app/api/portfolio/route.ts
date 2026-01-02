import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { calculatePortfolioSummary, HoldingWithPrice } from '@/lib/utils/portfolio';

// For now, we'll use a hardcoded user ID until auth is implemented
// TODO: Replace with actual authenticated user
const DEMO_USER_ID = 'demo-user';

/**
 * GET /api/portfolio
 * Get user's portfolio with all accounts and holdings
 */
export async function GET(request: NextRequest) {
  try {
    // Get user ID from query params or use demo user
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || DEMO_USER_ID;

    // Ensure demo user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: 'demo@example.com',
        name: 'Demo User',
      },
    });

    // Fetch all accounts with holdings for the user
    const accounts = await prisma.stockAccount.findMany({
      where: { userId },
      include: {
        holdings: true,
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

    // Fetch current prices for all symbols
    const prices = await getStockPrices(Array.from(allSymbols));

    // Transform accounts to include current prices
    const accountsWithPrices = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      broker: account.broker,
      holdings: account.holdings.map((holding) => {
        const priceResult = prices.get(holding.symbol);
        const currentPrice = priceResult && !isStockPriceError(priceResult)
          ? priceResult.price
          : 0;

        return {
          id: holding.id,
          symbol: holding.symbol,
          quantity: holding.quantity,
          avgCostBasis: holding.avgCostBasis,
          currentPrice,
        } as HoldingWithPrice;
      }),
    }));

    // Calculate portfolio summary
    const summary = calculatePortfolioSummary(accountsWithPrices);

    return NextResponse.json({
      success: true,
      data: {
        userId,
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
