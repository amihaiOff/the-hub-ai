import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrice, isStockPriceError } from '@/lib/api/stock-price';
import { createHoldingSchema } from '@/lib/validations/portfolio';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/portfolio/holdings
 * Add a new stock holding to an account
 * Also fetches and caches the current stock price from Yahoo Finance
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createHoldingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { accountId, symbol, name, taseSymbol, quantity, avgCostBasis } = validation.data;

    // Verify account exists and belongs to the authenticated user (authorization check)
    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Authorization check - verify user owns this account
    if (account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const upperSymbol = symbol.toUpperCase().trim();

    // Check if holding already exists for this symbol in this account
    const existingHolding = await prisma.stockHolding.findUnique({
      where: {
        accountId_symbol: {
          accountId,
          symbol: upperSymbol,
        },
      },
    });

    if (existingHolding) {
      return NextResponse.json(
        {
          success: false,
          error: `A holding for ${upperSymbol} already exists in this account. Use PUT to update it.`,
        },
        { status: 409 }
      );
    }

    // Fetch and cache the current stock price
    // This runs in parallel with creating the holding but we don't block on it
    const pricePromise = getStockPrice(upperSymbol);

    // Create the holding
    const holding = await prisma.stockHolding.create({
      data: {
        accountId,
        symbol: upperSymbol,
        name: name || null,
        taseSymbol: taseSymbol || null,
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
