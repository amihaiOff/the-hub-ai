import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';

export interface StockSymbol {
  symbol: string;
  name: string;
  exchange: string;
  currency?: string;
}

export interface StockSearchResponse {
  success: boolean;
  data?: StockSymbol[];
  error?: string;
}

interface YahooSearchResult {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  typeDisp?: string;
  quoteType?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchResult[];
}

// Map Yahoo exchange codes to readable names and currencies
function mapExchange(exchDisp?: string, exchange?: string): { name: string; currency: string } {
  const exch = exchDisp || exchange || '';

  // TASE
  if (exch.includes('Tel Aviv') || exch === 'TLV' || exch === 'TASE') {
    return { name: 'TASE', currency: 'ILS' };
  }
  // US exchanges
  if (exch.includes('NASDAQ') || exch === 'NMS' || exch === 'NGM' || exch === 'NCM') {
    return { name: 'NASDAQ', currency: 'USD' };
  }
  if (exch.includes('NYSE') || exch === 'NYQ') {
    return { name: 'NYSE', currency: 'USD' };
  }
  if (exch.includes('AMEX') || exch === 'ASE') {
    return { name: 'AMEX', currency: 'USD' };
  }
  // European exchanges
  if (exch.includes('Amsterdam') || exch === 'AMS') {
    return { name: 'Amsterdam', currency: 'EUR' };
  }
  if (exch.includes('XETRA') || exch === 'GER') {
    return { name: 'XETRA', currency: 'EUR' };
  }
  if (exch.includes('London') || exch === 'LSE' || exch === 'LON') {
    return { name: 'LSE', currency: 'GBP' };
  }

  return { name: exch || 'Unknown', currency: 'USD' };
}

async function searchYahoo(query: string): Promise<StockSymbol[]> {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data: YahooSearchResponse = await response.json();

    if (!data.quotes || data.quotes.length === 0) {
      return [];
    }

    return data.quotes
      .filter((quote) => {
        const type = quote.quoteType?.toUpperCase() || quote.typeDisp?.toUpperCase() || '';
        return type === 'EQUITY' || type === 'ETF' || type === 'STOCK' || type === 'INDEX';
      })
      .slice(0, 10)
      .map((quote) => {
        const { name: exchange, currency } = mapExchange(quote.exchDisp, quote.exchange);
        return {
          symbol: quote.symbol,
          name: quote.longname || quote.shortname || quote.symbol,
          exchange,
          currency,
        };
      });
  } catch (error) {
    console.error('Yahoo search error:', error);
    return [];
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<StockSearchResponse>> {
  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const results = await searchYahoo(query.trim());

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
