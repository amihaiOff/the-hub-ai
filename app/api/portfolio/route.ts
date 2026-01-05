import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { calculatePortfolioSummary, HoldingWithPrice } from '@/lib/utils/portfolio';

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

    // Fetch all accounts with holdings and owners for the user
    const accounts = await prisma.stockAccount.findMany({
      where: { userId },
      include: {
        holdings: true,
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

    // Fetch current prices for all symbols
    const prices = await getStockPrices(Array.from(allSymbols));

    // Transform accounts to include current prices and owners
    const accountsWithPrices = accounts.map((account) => ({
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
      owners: account.owners.map((o) => ({
        id: o.profile.id,
        name: o.profile.name,
        image: o.profile.image,
        color: o.profile.color,
      })),
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
