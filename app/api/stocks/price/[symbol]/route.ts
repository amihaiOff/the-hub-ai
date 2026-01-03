import { NextRequest, NextResponse } from 'next/server';
import { getStockPrice, isStockPriceError } from '@/lib/api/stock-price';
import { getCurrentUser } from '@/lib/auth-utils';

interface RouteParams {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/price/[symbol]
 * Get current stock price (with 6hr cache)
 */
// Symbol validation pattern: alphanumeric, dots, and hyphens, 1-15 chars
const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/i;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { symbol } = await params;

    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Stock symbol is required' },
        { status: 400 }
      );
    }

    // Validate symbol format to prevent abuse
    if (!SYMBOL_PATTERN.test(symbol.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock symbol format' },
        { status: 400 }
      );
    }

    const result = await getStockPrice(symbol.trim());

    if (isStockPriceError(result)) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        symbol: result.symbol,
        price: result.price,
        timestamp: result.timestamp.toISOString(),
        fromCache: result.fromCache,
      },
    });
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stock price' },
      { status: 500 }
    );
  }
}
