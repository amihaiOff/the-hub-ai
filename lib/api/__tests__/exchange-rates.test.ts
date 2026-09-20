/**
 * Unit tests for exchange-rates.ts
 * Tests convertPrice and fetchExchangeRates functions
 */

import {
  convertPrice,
  fetchExchangeRates,
  fetchRateToILS,
  type ExchangeRates,
} from '../exchange-rates';

const DEFAULT_RATES: ExchangeRates = {
  USD: 3.7,
  EUR: 4.0,
  GBP: 4.7,
  ILS: 1,
};

describe('convertPrice', () => {
  describe('same-currency passthrough', () => {
    it('should return the same price when converting USD to USD', () => {
      expect(convertPrice(100, 'USD', 'USD', DEFAULT_RATES)).toBe(100);
    });

    it('should return the same price when converting ILS to ILS', () => {
      expect(convertPrice(370, 'ILS', 'ILS', DEFAULT_RATES)).toBe(370);
    });

    it('should handle case-insensitive same-currency comparison', () => {
      expect(convertPrice(100, 'usd', 'USD', DEFAULT_RATES)).toBe(100);
      expect(convertPrice(100, 'USD', 'usd', DEFAULT_RATES)).toBe(100);
      expect(convertPrice(100, 'eur', 'EUR', DEFAULT_RATES)).toBe(100);
    });
  });

  describe('USD to ILS conversion', () => {
    it('should convert USD to ILS using the USD rate', () => {
      const result = convertPrice(100, 'USD', 'ILS', DEFAULT_RATES);
      expect(result).toBe(370); // 100 * 3.7
    });

    it('should handle fractional USD values', () => {
      const result = convertPrice(10.5, 'USD', 'ILS', DEFAULT_RATES);
      expect(result).toBeCloseTo(38.85, 2); // 10.5 * 3.7
    });

    it('should handle zero price', () => {
      const result = convertPrice(0, 'USD', 'ILS', DEFAULT_RATES);
      expect(result).toBe(0);
    });
  });

  describe('EUR to ILS conversion', () => {
    it('should convert EUR to ILS using the EUR rate', () => {
      const result = convertPrice(100, 'EUR', 'ILS', DEFAULT_RATES);
      expect(result).toBe(400); // 100 * 4.0
    });

    it('should handle fractional EUR values', () => {
      const result = convertPrice(25.5, 'EUR', 'ILS', DEFAULT_RATES);
      expect(result).toBeCloseTo(102, 2); // 25.5 * 4.0
    });
  });

  describe('GBP to ILS conversion', () => {
    it('should convert GBP to ILS using the GBP rate', () => {
      const result = convertPrice(100, 'GBP', 'ILS', DEFAULT_RATES);
      expect(result).toBe(470); // 100 * 4.7
    });
  });

  describe('cross-currency conversions', () => {
    it('should convert USD to EUR via ILS', () => {
      // 100 USD -> 370 ILS -> 370 / 4.0 EUR = 92.5 EUR
      const result = convertPrice(100, 'USD', 'EUR', DEFAULT_RATES);
      expect(result).toBeCloseTo(92.5, 2);
    });

    it('should convert EUR to USD via ILS', () => {
      // 100 EUR -> 400 ILS -> 400 / 3.7 USD ≈ 108.11 USD
      const result = convertPrice(100, 'EUR', 'USD', DEFAULT_RATES);
      expect(result).toBeCloseTo(108.11, 1);
    });
  });

  describe('unsupported currency fallback', () => {
    it('should fall back to USD rate for unsupported source currency', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Unknown currency JPY: falls back to USD rate (3.7), then converts to ILS
      const result = convertPrice(100, 'JPY', 'ILS', DEFAULT_RATES);
      expect(result).toBe(370); // 100 * 3.7 (USD fallback)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported price currency')
      );

      consoleSpy.mockRestore();
    });

    it('should fall back to USD rate for unsupported target currency', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // 100 USD -> 370 ILS -> 370 / 3.7 (USD fallback for unknown target) = 100
      const result = convertPrice(100, 'USD', 'JPY', DEFAULT_RATES);
      expect(result).toBeCloseTo(100, 2);

      consoleSpy.mockRestore();
    });
  });

  describe('zero-rate guard', () => {
    it('should use USD fallback when target rate is zero', () => {
      // EUR rate is 0, code falls back to rates.USD (3.7)
      // 100 ILS * 1 (ILS rate) = 100 ILS, then / 3.7 (USD fallback) ≈ 27.03
      const ratesWithZeroEUR: ExchangeRates = { ...DEFAULT_RATES, EUR: 0 };
      const result = convertPrice(100, 'ILS', 'EUR', ratesWithZeroEUR);
      expect(result).toBeCloseTo(27.03, 1);
    });

    it('should use the final fallback (1) when both target and USD rates are zero', () => {
      // Fallback chain: rates[target] || rates.USD || 1 => 0 || 0 || 1 => 1
      // 100 ILS * 1 (ILS rate) = 100 ILS, then / 1 = 100
      const ratesAllZero: ExchangeRates = { USD: 0, EUR: 0, GBP: 0, ILS: 1 };
      const result = convertPrice(100, 'ILS', 'EUR', ratesAllZero);
      expect(result).toBe(100);
    });
  });

  describe('ILS as source currency', () => {
    it('should convert ILS to USD', () => {
      // 370 ILS / 3.7 = 100 USD
      const result = convertPrice(370, 'ILS', 'USD', DEFAULT_RATES);
      expect(result).toBeCloseTo(100, 2);
    });

    it('should convert ILS to EUR', () => {
      // 400 ILS / 4.0 = 100 EUR
      const result = convertPrice(400, 'ILS', 'EUR', DEFAULT_RATES);
      expect(result).toBeCloseTo(100, 2);
    });
  });
});

describe('fetchExchangeRates', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should return exchange rates when all API calls succeed', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 4.0 } }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 4.7 } }] },
        }),
      });

    global.fetch = mockFetch;

    const rates = await fetchExchangeRates();

    expect(rates).toEqual({ USD: 3.7, EUR: 4.0, GBP: 4.7, ILS: 1 });
  });

  it('should return null when any API call fails', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 4.7 } }] },
        }),
      });

    global.fetch = mockFetch;

    const rates = await fetchExchangeRates();

    expect(rates).toBeNull();
  });

  it('should return null when a fetch throws', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));

    global.fetch = mockFetch;

    const rates = await fetchExchangeRates();

    expect(rates).toBeNull();
  });
});

describe('fetchRateToILS', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should return the direct rate when the direct ticker succeeds, without triangulating', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
      }),
    });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('USD');

    expect(rate).toBe(3.7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should triangulate through USD when the direct ticker fails (e.g. HUF, no HUFILS=X)', async () => {
    // 1) direct HUFILS=X 404s (matches how the real Yahoo 404 shapes a non-ok response)
    // 2) USDHUF=X succeeds
    // 3) USDILS=X succeeds
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 317 } }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
        }),
      });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('HUF');

    // usdToIls / usdToCurrency = 3.7 / 317
    expect(rate).toBeCloseTo(0.01167, 5);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should return null when the direct ticker fails and one triangulation leg also fails', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
        }),
      });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('HUF');

    expect(rate).toBeNull();
  });

  it('should return 1 immediately for ILS with no fetch calls', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('ILS');

    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null for USD when the direct ticker fails, without attempting self-referential triangulation', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('USD');

    expect(rate).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle lowercase currency codes, building uppercase ticker symbols', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: { result: [{ meta: { regularMarketPrice: 3.7 } }] },
      }),
    });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('usd');

    expect(rate).toBe(3.7);
    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('USDILS=X');
  });

  it('should return 1 immediately for lowercase "ils"', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('ils');

    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null rather than a garbage rate if a triangulation leg resolves to 0', async () => {
    // A malformed-but-technically-successful response (regularMarketPrice: 0)
    // must not slip past the null guard and get divided into a bogus rate.
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) }) // direct fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 317 } }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }),
      });
    global.fetch = mockFetch;

    const rate = await fetchRateToILS('HUF');

    expect(rate).toBeNull();
  });
});
