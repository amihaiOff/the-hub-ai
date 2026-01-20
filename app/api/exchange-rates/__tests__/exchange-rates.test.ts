/**
 * Integration tests for /api/exchange-rates endpoint
 * Tests exchange rate fetching via Yahoo Finance API
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

import { GET } from '../route';

describe('Exchange Rates API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const createYahooResponse = (price: number | null) => ({
    chart: {
      result: price !== null ? [{ meta: { regularMarketPrice: price } }] : [],
    },
  });

  describe('GET /api/exchange-rates', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
      expect(data.baseCurrency).toBe('ILS');
    });

    it('returns exchange rates successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(3.7)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.0)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.5)),
        });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.rates).toEqual({
        USD: 3.7,
        EUR: 4.0,
        GBP: 4.5,
        ILS: 1,
      });
      expect(data.baseCurrency).toBe('ILS');
    });

    it('returns 503 when USD rate fails to fetch', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.0)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.5)),
        });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch exchange rates');
    });

    it('returns 503 when EUR rate fails to fetch', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(3.7)),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.5)),
        });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch exchange rates');
    });

    it('returns 503 when GBP rate fails to fetch', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(3.7)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createYahooResponse(4.0)),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch exchange rates');
    });

    it('returns 503 when Yahoo returns empty result array', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ chart: { result: [] } }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
    });

    it('returns 503 when Yahoo returns no chart data', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
    });

    it('returns 503 when Yahoo returns undefined meta', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ chart: { result: [{}] } }),
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
    });

    it('returns 503 when fetch throws error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
    });

    it('handles top-level exception', async () => {
      mockGetCurrentUser.mockImplementation(() => {
        throw new Error('Auth service down');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch exchange rates');

      consoleErrorSpy.mockRestore();
    });

    it('fetches rates with correct Yahoo Finance URLs', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createYahooResponse(3.7)),
      });

      await GET();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('USDILS=X'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('EURILS=X'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('GBPILS=X'),
        expect.any(Object)
      );
    });
  });
});
