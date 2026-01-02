import { NextRequest, NextResponse } from 'next/server';
import { searchStocks, type StockSymbol } from '@/lib/data/stock-symbols';

export interface StockSearchResponse {
  success: boolean;
  data?: StockSymbol[];
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<StockSearchResponse>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Search stocks in-memory (fast)
    const results = searchStocks(query.trim(), 10);

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Stock search error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to search stocks',
      },
      { status: 500 }
    );
  }
}
