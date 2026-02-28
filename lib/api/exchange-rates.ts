// Shared exchange rate types and fetching for server-side use
// Rates are TO ILS (e.g., USD: 3.6 means 1 USD = 3.6 ILS)

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  ILS: number;
}

/**
 * Fetch a single exchange rate from Yahoo Finance
 */
async function fetchRate(symbol: string): Promise<number | null> {
  try {
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
  } catch {
    return null;
  }
}

// Supported currencies for exchange rate conversion
const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'ILS']);

/**
 * Convert a price from one currency to another using exchange rates.
 * Rates are TO ILS, so conversion goes: source → ILS → target.
 */
export function convertPrice(
  price: number,
  priceCurrency: string,
  targetCurrency: string,
  rates: ExchangeRates
): number {
  if (priceCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
    return price;
  }

  const upperPriceCurrency = priceCurrency.toUpperCase();
  const upperTargetCurrency = targetCurrency.toUpperCase();

  if (!SUPPORTED_CURRENCIES.has(upperPriceCurrency)) {
    console.warn(`Unsupported price currency: ${priceCurrency}, falling back to USD rate`);
  }

  const priceRate = rates[upperPriceCurrency as keyof ExchangeRates] || rates.USD || 1;
  const priceInILS = price * priceRate;

  if (upperTargetCurrency === 'ILS') {
    return priceInILS;
  }

  const targetRate = rates[upperTargetCurrency as keyof ExchangeRates] || rates.USD || 1;
  if (targetRate === 0) {
    console.warn(`Zero exchange rate for ${targetCurrency}, returning original price`);
    return price;
  }

  return priceInILS / targetRate;
}

/**
 * Fetch exchange rates from Yahoo Finance
 * Returns rates TO ILS (e.g., USD: 3.6 means 1 USD = 3.6 ILS)
 */
export async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
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
