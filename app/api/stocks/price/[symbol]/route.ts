import { NextRequest, NextResponse } from 'next/server';
import { getStockPrice, isStockPriceError } from '@/lib/api/stock-price';
import { getCurrentUser } from '@/lib/auth-utils';
import { createRateLimiter } from '@/lib/api/rate-limit';

interface RouteParams {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/stocks/price/[symbol]
 * Get current stock price (with 6hr cache)
 */
// Symbol validation pattern: alphanumeric, dots, and hyphens, 1-15 chars
const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,15}$/i;

// Per-user rate limit: 20 requests / minute. The 6hr cache absorbs most
// legitimate traffic; this guards against a client loop hammering the
// endpoint (which would then hammer Yahoo/Alpha Vantage on a cache miss).
// In-memory only — good enough for single-instance deployments.
const symbolLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!symbolLimiter.tryAcquire(user.id)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Try again in a minute.' },
        { status: 429 }
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
      return NextResponse.json({ success: false, error: result.error }, { status: 404 });
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
