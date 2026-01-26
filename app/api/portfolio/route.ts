import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { calculatePortfolioSummary, HoldingWithPrice } from '@/lib/utils/portfolio';

// Exchange rates interface (rates are TO ILS, e.g., USD: 3.6 means 1 USD = 3.6 ILS)
interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  ILS: number;
}

/**
 * Fetch exchange rates from Yahoo Finance
 * Returns rates TO ILS (e.g., USD: 3.6 means 1 USD = 3.6 ILS)
 */
async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const fetchRate = async (symbol: string): Promise<number | null> => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    };

    const [usdRate, eurRate, gbpRate] = await Promise.all([
      fetchRate('USDILS=X'),
      fetchRate('EURILS=X'),
      fetchRate('GBPILS=X'),
    ]);

    if (usdRate === null || eurRate === null || gbpRate === null) {
      return null;
    }

    return { USD: usdRate, EUR: eurRate, GBP: gbpRate, ILS: 1 };
  } catch {
    return null;
  }
}

// Supported currencies for exchange rate conversion
const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'ILS']);

/**
 * Convert a price from one currency to the account's currency
 */
function convertPrice(
  price: number,
  priceCurrency: string,
  accountCurrency: string,
  rates: ExchangeRates
): number {
  // Same currency, no conversion needed
  if (priceCurrency.toUpperCase() === accountCurrency.toUpperCase()) {
    return price;
  }

  const upperPriceCurrency = priceCurrency.toUpperCase();
  const upperAccountCurrency = accountCurrency.toUpperCase();

  // Log warning for unsupported currencies
  if (!SUPPORTED_CURRENCIES.has(upperPriceCurrency)) {
    console.warn(`Unsupported price currency: ${priceCurrency}, falling back to USD rate`);
  }

  // Get the rate for price currency (fallback to USD, then to 1)
  const priceRate = rates[upperPriceCurrency as keyof ExchangeRates] || rates.USD || 1;

  // Convert to ILS first (rates are TO ILS)
  const priceInILS = price * priceRate;

  // If account is ILS, we're done
  if (upperAccountCurrency === 'ILS') {
    return priceInILS;
  }

  // Otherwise convert from ILS to account currency
  // Get account rate with fallbacks to prevent division by zero
  const accountRate = rates[upperAccountCurrency as keyof ExchangeRates] || rates.USD || 1;
  if (accountRate === 0) {
    console.warn(`Zero exchange rate for ${accountCurrency}, returning original price`);
    return price;
  }

  return priceInILS / accountRate;
}

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

    // Fetch all accounts with holdings, cash balances, and owners for the user
    const accounts = await prisma.stockAccount.findMany({
      where: { userId },
      include: {
        holdings: true,
        cashBalances: true,
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

    // Fetch exchange rates for currency conversion
    const rates = await fetchExchangeRates();

    // Transform accounts to include current prices, cash balances, and owners
    const accountsWithPrices = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      broker: account.broker,
      currency: account.currency,
      holdings: account.holdings.map((holding) => {
        const priceResult = prices.get(holding.symbol);
        const fetchedPrice = priceResult && !isStockPriceError(priceResult) ? priceResult.price : 0;
        // Get the currency the price is quoted in (for dual-listed stocks like EIMI.L in GBP)
        const fetchedPriceCurrency =
          priceResult && !isStockPriceError(priceResult) ? priceResult.currency : account.currency;

        // Convert price to account currency if needed
        // This ensures gains/losses are calculated in the account's native currency
        let currentPrice = fetchedPrice;
        let originalPrice: number | undefined;
        let originalPriceCurrency: string | undefined;

        if (rates && fetchedPriceCurrency !== account.currency && fetchedPrice > 0) {
          // Price needs conversion - store original for display
          originalPrice = fetchedPrice;
          originalPriceCurrency = fetchedPriceCurrency;
          currentPrice = convertPrice(fetchedPrice, fetchedPriceCurrency, account.currency, rates);
        }

        return {
          id: holding.id,
          symbol: holding.symbol,
          name: holding.name,
          taseSymbol: holding.taseSymbol,
          quantity: holding.quantity,
          avgCostBasis: holding.avgCostBasis,
          currentPrice,
          originalPrice,
          originalPriceCurrency,
        } as HoldingWithPrice;
      }),
      // Include cash balances, converting to account currency if needed
      cashBalances: account.cashBalances.map((cash) => {
        const amount = Number(cash.amount);
        // Convert cash to account currency if it's in a different currency
        let convertedAmount = amount;
        if (rates && cash.currency !== account.currency && amount > 0) {
          convertedAmount = convertPrice(amount, cash.currency, account.currency, rates);
        }
        return {
          id: cash.id,
          currency: cash.currency,
          amount,
          convertedAmount,
        };
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
