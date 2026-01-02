import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStockPrice, isStockPriceError } from '@/lib/api/stock-price';

/**
 * POST /api/portfolio/holdings
 * Add a new stock holding to an account
 * Also fetches and caches the current stock price from Yahoo Finance
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { accountId, symbol, quantity, avgCostBasis } = body;

    // Validate required fields
    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Stock symbol is required' },
        { status: 400 }
      );
    }

    if (quantity === undefined || typeof quantity !== 'number' || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    if (avgCostBasis === undefined || typeof avgCostBasis !== 'number' || avgCostBasis < 0) {
      return NextResponse.json(
        { success: false, error: 'Average cost basis must be a non-negative number' },
        { status: 400 }
      );
    }

    // Verify account exists and belongs to the authenticated user (authorization check)
    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (account.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Check if holding already exists for this symbol in this account
    const existingHolding = await prisma.stockHolding.findUnique({
      where: {
        accountId_symbol: {
          accountId,
          symbol: symbol.toUpperCase().trim(),
        },
      },
    });

    if (existingHolding) {
      return NextResponse.json(
        {
          success: false,
          error: `A holding for ${symbol.toUpperCase()} already exists in this account. Use PUT to update it.`
        },
        { status: 409 }
      );
    }

    const upperSymbol = symbol.toUpperCase().trim();

    // Fetch and cache the current stock price
    // This runs in parallel with creating the holding but we don't block on it
    const pricePromise = getStockPrice(upperSymbol);

    // Create the holding
    const holding = await prisma.stockHolding.create({
      data: {
        accountId,
        symbol: upperSymbol,
        quantity,
        avgCostBasis,
      },
    });

    // Wait for price fetch to complete (it's already cached by getStockPrice)
    const priceResult = await pricePromise;
    const currentPrice = !isStockPriceError(priceResult) ? priceResult.price : null;

    return NextResponse.json({
      success: true,
      data: {
        ...holding,
        currentPrice,
        priceFromCache: !isStockPriceError(priceResult) ? priceResult.fromCache : null,
      },
    });
  } catch (error) {
    console.error('Error creating holding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create holding' },
      { status: 500 }
    );
  }
}
