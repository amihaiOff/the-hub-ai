import { prisma } from '@/lib/db';

// Cache duration: 6 hours in milliseconds
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

// Alpha Vantage API rate limits
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// Yahoo Finance API
const YAHOO_FINANCE_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface AlphaVantageQuote {
  'Global Quote': {
    '01. symbol': string;
    '02. open': string;
    '03. high': string;
    '04. low': string;
    '05. price': string;
    '06. volume': string;
    '07. latest trading day': string;
    '08. previous close': string;
    '09. change': string;
    '10. change percent': string;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        symbol?: string;
        currency?: string;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

interface StockPrice {
  symbol: string;
  price: number;
  currency: string; // Currency the price is quoted in (e.g., "USD", "GBP", "EUR", "ILS")
  timestamp: Date;
  fromCache: boolean;
}

interface StockPriceError {
  symbol: string;
  error: string;
}

type StockPriceResult = StockPrice | StockPriceError;

/**
 * Check if a cached price is still valid (within 6 hours)
 */
function isCacheValid(timestamp: Date): boolean {
  const now = new Date();
  return now.getTime() - timestamp.getTime() < CACHE_DURATION_MS;
}

/**
 * Infer currency from Yahoo Finance symbol suffix
 * Used as fallback when currency is not stored in cache
 */
function inferCurrencyFromSymbol(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();

  // London Stock Exchange (GBP) - most common for dual-listed stocks in Israel
  if (upperSymbol.endsWith('.L')) return 'GBP';

  // Tel Aviv Stock Exchange (ILS)
  if (upperSymbol.endsWith('.TA')) return 'ILS';

  // European exchanges (EUR)
  if (
    upperSymbol.endsWith('.PA') || // Paris
    upperSymbol.endsWith('.DE') || // XETRA/Germany
    upperSymbol.endsWith('.AS') || // Amsterdam
    upperSymbol.endsWith('.MI') // Milan
  )
    return 'EUR';

  // Default to USD for US exchanges (no suffix) and unknown
  return 'USD';
}

/**
 * Get cached price for a symbol if valid
 */
async function getCachedPrice(symbol: string): Promise<StockPrice | null> {
  const cached = await prisma.stockPriceHistory.findFirst({
    where: { symbol: symbol.toUpperCase() },
    orderBy: { timestamp: 'desc' },
  });

  if (cached && isCacheValid(cached.timestamp)) {
    return {
      symbol: cached.symbol,
      price: cached.price.toNumber(),
      currency: inferCurrencyFromSymbol(cached.symbol), // Infer from symbol suffix
      timestamp: cached.timestamp,
      fromCache: true,
    };
  }

  return null;
}

/**
 * Save price to cache
 */
async function cachePrice(symbol: string, price: number): Promise<void> {
  await prisma.stockPriceHistory.create({
    data: {
      symbol: symbol.toUpperCase(),
      price,
      timestamp: new Date(),
    },
  });
}

interface YahooFetchResult {
  price: number;
  currency: string;
}

/**
 * Fetch stock price from Yahoo Finance API (primary source - no API key needed)
 */
async function fetchFromYahooFinance(symbol: string): Promise<YahooFetchResult | null> {
  try {
    const url = `${YAHOO_FINANCE_BASE_URL}/${encodeURIComponent(symbol.toUpperCase())}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Yahoo Finance API error: ${response.status}`);
      return null;
    }

    const data: YahooChartResponse = await response.json();

    // Check for errors in response
    if (data.chart?.error) {
      console.warn(`Yahoo Finance error for ${symbol}: ${data.chart.error.description}`);
      return null;
    }

    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (price === undefined || price === null) {
      console.warn(`No price data from Yahoo Finance for symbol: ${symbol}`);
      return null;
    }

    // Extract currency from meta, default to USD if not provided
    const currency = meta?.currency || 'USD';

    return { price, currency };
  } catch (error) {
    console.error(`Error fetching price from Yahoo Finance for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch stock price from Alpha Vantage API (fallback source)
 */
async function fetchFromAlphaVantage(symbol: string): Promise<number | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    console.warn('ALPHA_VANTAGE_API_KEY not configured');
    return null;
  }

  try {
    const url = new URL(ALPHA_VANTAGE_BASE_URL);
    url.searchParams.set('function', 'GLOBAL_QUOTE');
    url.searchParams.set('symbol', symbol.toUpperCase());
    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'TheHubAI/1.0',
      },
    });

    if (!response.ok) {
      console.error(`Alpha Vantage API error: ${response.status}`);
      return null;
    }

    const data: AlphaVantageQuote = await response.json();

    // Check for API rate limit or errors
    if (!data['Global Quote'] || !data['Global Quote']['05. price']) {
      console.warn(`No price data for symbol: ${symbol}`);
      return null;
    }

    const price = parseFloat(data['Global Quote']['05. price']);
    return isNaN(price) ? null : price;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get stock price with caching
 * 1. Check cache first
 * 2. If cache miss/expired, fetch from Yahoo Finance (primary)
 * 3. If Yahoo fails, try Alpha Vantage (fallback)
 * 4. If both fail, return most recent cached price (stale fallback)
 */
export async function getStockPrice(symbol: string): Promise<StockPriceResult> {
  const upperSymbol = symbol.toUpperCase();

  // Try cache first
  const cached = await getCachedPrice(upperSymbol);
  if (cached) {
    return cached;
  }

  // Try Yahoo Finance first (no API key required)
  let yahooResult = await fetchFromYahooFinance(upperSymbol);

  // If Yahoo fails, try Alpha Vantage as fallback
  if (yahooResult === null) {
    console.log(`Yahoo Finance failed for ${upperSymbol}, trying Alpha Vantage...`);
    const alphaPrice = await fetchFromAlphaVantage(upperSymbol);
    if (alphaPrice !== null) {
      // Alpha Vantage doesn't return currency, assume USD
      yahooResult = { price: alphaPrice, currency: 'USD' };
    }
  }

  if (yahooResult !== null) {
    // Cache the new price
    await cachePrice(upperSymbol, yahooResult.price);

    return {
      symbol: upperSymbol,
      price: yahooResult.price,
      currency: yahooResult.currency,
      timestamp: new Date(),
      fromCache: false,
    };
  }

  // Fallback to most recent cached price (even if expired)
  const fallbackCached = await prisma.stockPriceHistory.findFirst({
    where: { symbol: upperSymbol },
    orderBy: { timestamp: 'desc' },
  });

  if (fallbackCached) {
    return {
      symbol: fallbackCached.symbol,
      price: fallbackCached.price.toNumber(),
      currency: inferCurrencyFromSymbol(fallbackCached.symbol), // Infer from symbol suffix
      timestamp: fallbackCached.timestamp,
      fromCache: true,
    };
  }

  // No price available
  return {
    symbol: upperSymbol,
    error: 'Unable to fetch stock price. Please try again later.',
  };
}

/**
 * Get prices for multiple symbols
 * Optimized to check cache first with a single query, then batch API calls
 */
export async function getStockPrices(symbols: string[]): Promise<Map<string, StockPriceResult>> {
  const results = new Map<string, StockPriceResult>();
  const upperSymbols = symbols.map((s) => s.toUpperCase());

  // Fetch all cached prices in a single query (fixes N+1 issue)
  const cachedPrices = await prisma.stockPriceHistory.findMany({
    where: { symbol: { in: upperSymbols } },
    orderBy: { timestamp: 'desc' },
    distinct: ['symbol'],
  });

  // Build a map of valid cached prices
  const symbolsToFetch: string[] = [];
  const cachedMap = new Map(cachedPrices.map((c) => [c.symbol, c]));

  for (const upperSymbol of upperSymbols) {
    const cached = cachedMap.get(upperSymbol);

    if (cached && isCacheValid(cached.timestamp)) {
      results.set(upperSymbol, {
        symbol: cached.symbol,
        price: cached.price.toNumber(),
        currency: inferCurrencyFromSymbol(cached.symbol), // Infer from symbol suffix
        timestamp: cached.timestamp,
        fromCache: true,
      });
    } else {
      symbolsToFetch.push(upperSymbol);
    }
  }

  // Fetch remaining symbols from API
  // Yahoo Finance (primary) has more lenient rate limits than Alpha Vantage
  for (const symbol of symbolsToFetch) {
    const result = await getStockPrice(symbol);
    results.set(symbol, result);

    // Small delay to be respectful to the API
    if (symbolsToFetch.indexOf(symbol) < symbolsToFetch.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Check if a result is an error
 */
export function isStockPriceError(result: StockPriceResult): result is StockPriceError {
  return 'error' in result;
}

/**
 * Get the most recent cached price for a symbol (ignoring cache validity)
 * Useful for displaying stale prices with a warning
 */
export async function getLatestCachedPrice(symbol: string): Promise<StockPrice | null> {
  const cached = await prisma.stockPriceHistory.findFirst({
    where: { symbol: symbol.toUpperCase() },
    orderBy: { timestamp: 'desc' },
  });

  if (!cached) return null;

  return {
    symbol: cached.symbol,
    price: cached.price.toNumber(),
    currency: inferCurrencyFromSymbol(cached.symbol), // Infer from symbol suffix
    timestamp: cached.timestamp,
    fromCache: true,
  };
}

/**
 * Manually update the cache for a symbol
 * Useful for the cron job that updates prices periodically
 * Uses Yahoo Finance as primary, Alpha Vantage as fallback
 */
export async function updateStockPriceCache(symbol: string): Promise<StockPriceResult> {
  const upperSymbol = symbol.toUpperCase();

  // Try Yahoo Finance first
  let yahooResult = await fetchFromYahooFinance(upperSymbol);

  // Fallback to Alpha Vantage if Yahoo fails
  if (yahooResult === null) {
    const alphaPrice = await fetchFromAlphaVantage(upperSymbol);
    if (alphaPrice !== null) {
      yahooResult = { price: alphaPrice, currency: 'USD' };
    }
  }

  if (yahooResult !== null) {
    await cachePrice(upperSymbol, yahooResult.price);
    return {
      symbol: upperSymbol,
      price: yahooResult.price,
      currency: yahooResult.currency,
      timestamp: new Date(),
      fromCache: false,
    };
  }

  return {
    symbol: upperSymbol,
    error: 'Failed to update price from API',
  };
}
