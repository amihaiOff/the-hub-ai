import { prisma } from '@/lib/db';

// Cache duration: 6 hours in milliseconds
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

// Alpha Vantage API rate limits
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

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

interface StockPrice {
  symbol: string;
  price: number;
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

/**
 * Fetch stock price from Alpha Vantage API
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
 * 2. If cache miss/expired, fetch from API
 * 3. If API fails, return most recent cached price (fallback)
 */
export async function getStockPrice(symbol: string): Promise<StockPriceResult> {
  const upperSymbol = symbol.toUpperCase();

  // Try cache first
  const cached = await getCachedPrice(upperSymbol);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const apiPrice = await fetchFromAlphaVantage(upperSymbol);

  if (apiPrice !== null) {
    // Cache the new price
    await cachePrice(upperSymbol, apiPrice);

    return {
      symbol: upperSymbol,
      price: apiPrice,
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
 * Optimized to check cache first, then batch API calls
 */
export async function getStockPrices(symbols: string[]): Promise<Map<string, StockPriceResult>> {
  const results = new Map<string, StockPriceResult>();
  const symbolsToFetch: string[] = [];

  // Check cache for all symbols first
  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase();
    const cached = await getCachedPrice(upperSymbol);

    if (cached) {
      results.set(upperSymbol, cached);
    } else {
      symbolsToFetch.push(upperSymbol);
    }
  }

  // Fetch remaining symbols from API (with rate limiting)
  // Alpha Vantage free tier: 5 API calls per minute
  for (const symbol of symbolsToFetch) {
    const result = await getStockPrice(symbol);
    results.set(symbol, result);

    // Rate limit: wait 12 seconds between API calls for free tier
    // In production, use a paid tier or implement proper rate limiting
    if (symbolsToFetch.indexOf(symbol) < symbolsToFetch.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
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
    timestamp: cached.timestamp,
    fromCache: true,
  };
}

/**
 * Manually update the cache for a symbol
 * Useful for the cron job that updates prices periodically
 */
export async function updateStockPriceCache(symbol: string): Promise<StockPriceResult> {
  const upperSymbol = symbol.toUpperCase();
  const apiPrice = await fetchFromAlphaVantage(upperSymbol);

  if (apiPrice !== null) {
    await cachePrice(upperSymbol, apiPrice);
    return {
      symbol: upperSymbol,
      price: apiPrice,
      timestamp: new Date(),
      fromCache: false,
    };
  }

  return {
    symbol: upperSymbol,
    error: 'Failed to update price from API',
  };
}
