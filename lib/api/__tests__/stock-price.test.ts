/**
 * Unit tests for stock-price.ts
 * Tests the Yahoo Finance and Alpha Vantage API integrations
 * with caching behavior and fallback logic
 */

// Mock Prisma client before imports
jest.mock('@/lib/db', () => ({
  prisma: {
    stockPriceHistory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { prisma } from '@/lib/db';
import {
  getStockPrice,
  getStockPrices,
  isStockPriceError,
  getLatestCachedPrice,
  updateStockPriceCache,
} from '../stock-price';

describe('Stock Price Module', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Reset environment variables
    process.env.ALPHA_VANTAGE_API_KEY = 'test-api-key';
  });

  describe('isStockPriceError', () => {
    it('should return true for error results', () => {
      const errorResult = { symbol: 'INVALID', error: 'Not found' };
      expect(isStockPriceError(errorResult)).toBe(true);
    });

    it('should return false for successful price results', () => {
      const priceResult = {
        symbol: 'AAPL',
        price: 150.25,
        timestamp: new Date(),
        fromCache: false,
      };
      expect(isStockPriceError(priceResult)).toBe(false);
    });
  });

  describe('getStockPrice', () => {
    describe('Cache behavior', () => {
      it('should return cached price if within 6 hours', async () => {
        const cachedTime = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
        const mockCached = {
          symbol: 'AAPL',
          price: { toNumber: () => 150.50 },
          timestamp: cachedTime,
        };

        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(mockCached);

        const result = await getStockPrice('AAPL');

        expect(result).toEqual({
          symbol: 'AAPL',
          price: 150.50,
          timestamp: cachedTime,
          fromCache: true,
        });
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should fetch from API if cache is expired (> 6 hours)', async () => {
        const expiredTime = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 hours ago
        const mockExpiredCache = {
          symbol: 'AAPL',
          price: { toNumber: () => 145.00 },
          timestamp: expiredTime,
        };

        // First call returns expired cache (cache check)
        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(mockExpiredCache);

        // Mock Yahoo Finance API response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 155.25,
                    symbol: 'AAPL',
                    currency: 'USD',
                  },
                },
              ],
            },
          }),
        });

        (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

        const result = await getStockPrice('AAPL');

        expect(isStockPriceError(result)).toBe(false);
        if (!isStockPriceError(result)) {
          expect(result.symbol).toBe('AAPL');
          expect(result.price).toBe(155.25);
          expect(result.fromCache).toBe(false);
        }
      });

      it('should normalize symbol to uppercase', async () => {
        const cachedTime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
        const mockCached = {
          symbol: 'AAPL',
          price: { toNumber: () => 150.00 },
          timestamp: cachedTime,
        };

        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(mockCached);

        await getStockPrice('aapl');

        expect(prisma.stockPriceHistory.findFirst).toHaveBeenCalledWith({
          where: { symbol: 'AAPL' },
          orderBy: { timestamp: 'desc' },
        });
      });
    });

    describe('Yahoo Finance API', () => {
      beforeEach(() => {
        // No cache for these tests
        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValue(null);
      });

      it('should fetch price from Yahoo Finance successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 175.50,
                    symbol: 'GOOGL',
                    currency: 'USD',
                  },
                },
              ],
            },
          }),
        });

        (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

        const result = await getStockPrice('GOOGL');

        expect(isStockPriceError(result)).toBe(false);
        if (!isStockPriceError(result)) {
          expect(result.symbol).toBe('GOOGL');
          expect(result.price).toBe(175.50);
          expect(result.fromCache).toBe(false);
        }

        // Verify Yahoo Finance was called with correct URL
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('query1.finance.yahoo.com'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'User-Agent': expect.any(String),
            }),
          })
        );
      });

      it('should handle Yahoo Finance API error response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              error: {
                code: 'Not Found',
                description: 'No data found for symbol: INVALID',
              },
            },
          }),
        });

        // Also mock Alpha Vantage fallback to fail
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

        const result = await getStockPrice('INVALID');

        expect(isStockPriceError(result)).toBe(true);
        if (isStockPriceError(result)) {
          expect(result.error).toContain('Unable to fetch stock price');
        }
      });

      it('should handle Yahoo Finance HTTP error', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
          });

        const result = await getStockPrice('AAPL');

        expect(isStockPriceError(result)).toBe(true);
      });

      it('should handle Yahoo Finance network error', async () => {
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
          });

        const result = await getStockPrice('AAPL');

        expect(isStockPriceError(result)).toBe(true);
      });
    });

    describe('Alpha Vantage Fallback', () => {
      beforeEach(() => {
        // No cache
        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValue(null);
      });

      it('should fallback to Alpha Vantage when Yahoo Finance fails', async () => {
        // Yahoo Finance fails
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              error: {
                code: 'Not Found',
                description: 'Symbol not found',
              },
            },
          }),
        });

        // Alpha Vantage succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            'Global Quote': {
              '01. symbol': 'MSFT',
              '05. price': '380.50',
            },
          }),
        });

        (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

        const result = await getStockPrice('MSFT');

        expect(isStockPriceError(result)).toBe(false);
        if (!isStockPriceError(result)) {
          expect(result.symbol).toBe('MSFT');
          expect(result.price).toBe(380.50);
        }

        // Verify both APIs were called
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should not call Alpha Vantage if API key is missing', async () => {
        delete process.env.ALPHA_VANTAGE_API_KEY;

        // Yahoo Finance fails
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const result = await getStockPrice('AAPL');

        // Only Yahoo Finance should be called
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(isStockPriceError(result)).toBe(true);
      });

      it('should handle Alpha Vantage rate limit response', async () => {
        // Yahoo Finance fails
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
        });

        // Alpha Vantage returns rate limit (no Global Quote)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute.',
          }),
        });

        const result = await getStockPrice('AAPL');

        expect(isStockPriceError(result)).toBe(true);
      });
    });

    describe('Stale Cache Fallback', () => {
      it('should return stale cached price when all APIs fail', async () => {
        const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        const staleCached = {
          symbol: 'AAPL',
          price: { toNumber: () => 140.00 },
          timestamp: staleTime,
        };

        // First findFirst for cache check (returns expired cache)
        (prisma.stockPriceHistory.findFirst as jest.Mock)
          .mockResolvedValueOnce(staleCached) // Initial cache check (expired)
          .mockResolvedValueOnce(staleCached); // Fallback stale cache lookup

        // Both APIs fail
        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 });

        const result = await getStockPrice('AAPL');

        expect(isStockPriceError(result)).toBe(false);
        if (!isStockPriceError(result)) {
          expect(result.symbol).toBe('AAPL');
          expect(result.price).toBe(140.00);
          expect(result.fromCache).toBe(true);
        }
      });

      it('should return error when no cache exists and APIs fail', async () => {
        (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValue(null);

        // Both APIs fail
        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 });

        const result = await getStockPrice('UNKNOWN');

        expect(isStockPriceError(result)).toBe(true);
        if (isStockPriceError(result)) {
          expect(result.symbol).toBe('UNKNOWN');
          expect(result.error).toContain('Unable to fetch stock price');
        }
      });
    });
  });

  describe('getStockPrices', () => {
    it('should fetch multiple stock prices', async () => {
      const cachedTime = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Both symbols are cached - using findMany now
      (prisma.stockPriceHistory.findMany as jest.Mock).mockResolvedValueOnce([
        {
          symbol: 'AAPL',
          price: { toNumber: () => 150.00 },
          timestamp: cachedTime,
        },
        {
          symbol: 'GOOGL',
          price: { toNumber: () => 175.00 },
          timestamp: cachedTime,
        },
      ]);

      const results = await getStockPrices(['AAPL', 'GOOGL']);

      expect(results.size).toBe(2);

      const aaplResult = results.get('AAPL');
      expect(aaplResult).toBeDefined();
      if (aaplResult && !isStockPriceError(aaplResult)) {
        expect(aaplResult.price).toBe(150.00);
      }

      const googlResult = results.get('GOOGL');
      expect(googlResult).toBeDefined();
      if (googlResult && !isStockPriceError(googlResult)) {
        expect(googlResult.price).toBe(175.00);
      }
    });

    it('should fetch from API for uncached symbols', async () => {
      const cachedTime = new Date(Date.now() - 1 * 60 * 60 * 1000);

      // Only AAPL is cached - findMany returns only cached items
      (prisma.stockPriceHistory.findMany as jest.Mock).mockResolvedValueOnce([
        {
          symbol: 'AAPL',
          price: { toNumber: () => 150.00 },
          timestamp: cachedTime,
        },
      ]);

      // MSFT cache check in getStockPrice (called for uncached symbol)
      (prisma.stockPriceHistory.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // MSFT cache check
        .mockResolvedValueOnce(null); // MSFT fallback check (if API fails)

      // Mock Yahoo Finance for MSFT
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 380.00,
                  symbol: 'MSFT',
                },
              },
            ],
          },
        }),
      });

      (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

      const results = await getStockPrices(['AAPL', 'MSFT']);

      expect(results.size).toBe(2);

      const aaplResult = results.get('AAPL');
      if (aaplResult && !isStockPriceError(aaplResult)) {
        expect(aaplResult.fromCache).toBe(true);
      }

      const msftResult = results.get('MSFT');
      if (msftResult && !isStockPriceError(msftResult)) {
        expect(msftResult.fromCache).toBe(false);
      }
    });
  });

  describe('getLatestCachedPrice', () => {
    it('should return latest cached price regardless of age', async () => {
      const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const mockCached = {
        symbol: 'AAPL',
        price: { toNumber: () => 120.00 },
        timestamp: oldTime,
      };

      (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(mockCached);

      const result = await getLatestCachedPrice('AAPL');

      expect(result).not.toBeNull();
      if (result) {
        expect(result.symbol).toBe('AAPL');
        expect(result.price).toBe(120.00);
        expect(result.timestamp).toEqual(oldTime);
      }
    });

    it('should return null if no cached price exists', async () => {
      (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const result = await getLatestCachedPrice('NEWSTOCK');

      expect(result).toBeNull();
    });
  });

  describe('updateStockPriceCache', () => {
    it('should update cache from Yahoo Finance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 160.00,
                  symbol: 'AAPL',
                },
              },
            ],
          },
        }),
      });

      (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

      const result = await updateStockPriceCache('AAPL');

      expect(isStockPriceError(result)).toBe(false);
      if (!isStockPriceError(result)) {
        expect(result.price).toBe(160.00);
        expect(result.fromCache).toBe(false);
      }

      expect(prisma.stockPriceHistory.create).toHaveBeenCalledWith({
        data: {
          symbol: 'AAPL',
          price: 160.00,
          timestamp: expect.any(Date),
        },
      });
    });

    it('should fallback to Alpha Vantage in updateStockPriceCache', async () => {
      // Yahoo fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      // Alpha Vantage succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '155.00',
          },
        }),
      });

      (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

      const result = await updateStockPriceCache('AAPL');

      expect(isStockPriceError(result)).toBe(false);
      if (!isStockPriceError(result)) {
        expect(result.price).toBe(155.00);
      }
    });

    it('should return error when both APIs fail in updateStockPriceCache', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await updateStockPriceCache('AAPL');

      expect(isStockPriceError(result)).toBe(true);
      if (isStockPriceError(result)) {
        expect(result.error).toContain('Failed to update price from API');
      }
    });
  });

  describe('Cache validity', () => {
    it('should consider 5 hour 59 minute old cache as valid', async () => {
      const almostExpiredTime = new Date(Date.now() - (6 * 60 * 60 * 1000 - 60000)); // 5h 59m ago
      const mockCached = {
        symbol: 'AAPL',
        price: { toNumber: () => 150.00 },
        timestamp: almostExpiredTime,
      };

      (prisma.stockPriceHistory.findFirst as jest.Mock).mockResolvedValueOnce(mockCached);

      const result = await getStockPrice('AAPL');

      expect(isStockPriceError(result)).toBe(false);
      if (!isStockPriceError(result)) {
        expect(result.fromCache).toBe(true);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should consider 6 hour 1 minute old cache as expired', async () => {
      const justExpiredTime = new Date(Date.now() - (6 * 60 * 60 * 1000 + 60000)); // 6h 1m ago
      const mockCached = {
        symbol: 'AAPL',
        price: { toNumber: () => 150.00 },
        timestamp: justExpiredTime,
      };

      (prisma.stockPriceHistory.findFirst as jest.Mock)
        .mockResolvedValueOnce(mockCached) // Initial cache check
        .mockResolvedValueOnce(mockCached); // Stale fallback

      // Mock successful API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{ meta: { regularMarketPrice: 155.00 } }],
          },
        }),
      });

      (prisma.stockPriceHistory.create as jest.Mock).mockResolvedValueOnce({});

      const result = await getStockPrice('AAPL');

      expect(mockFetch).toHaveBeenCalled();
      expect(isStockPriceError(result)).toBe(false);
      if (!isStockPriceError(result)) {
        expect(result.price).toBe(155.00);
        expect(result.fromCache).toBe(false);
      }
    });
  });
});
