/**
 * Unit tests for moneytor.ts
 * Tests the Moneytor REST API integration including success path,
 * typed error handling, and request URL construction.
 */

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { fetchMoneytorTransactions, MoneytorApiError, type MoneytorTransaction } from '../moneytor';

describe('fetchMoneytorTransactions', () => {
  const ORIGINAL_TOKEN = process.env.MONEYTOR_API_TOKEN;

  beforeEach(() => {
    jest.resetAllMocks();
    // Set a token by default. Individual tests override as needed.
    process.env.MONEYTOR_API_TOKEN = 'test-moneytor-token';
  });

  afterAll(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.MONEYTOR_API_TOKEN;
    } else {
      process.env.MONEYTOR_API_TOKEN = ORIGINAL_TOKEN;
    }
  });

  describe('Success path', () => {
    it('returns an array of MoneytorTransaction on a successful response', async () => {
      const sampleTx: MoneytorTransaction[] = [
        {
          id: 'tx_1',
          date: '2026-05-01',
          amount: -42.5,
          currency: 'ILS',
          description: 'Coffee',
          category: 'Food',
          accountId: 'acc_1',
          type: 'expense',
        },
        {
          id: 'tx_2',
          date: '2026-05-02',
          amount: 10000,
          currency: 'ILS',
          description: 'Salary',
          category: 'Income',
          accountId: 'acc_1',
          type: 'income',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          count: sampleTx.length,
          transactions: sampleTx,
        }),
      });

      const result = await fetchMoneytorTransactions();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result).toEqual(sampleTx);

      // Authorization header should carry the bearer token.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init).toMatchObject({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-moneytor-token',
          Accept: 'application/json',
        }),
        cache: 'no-store',
      });
    });

    it('returns an empty array when the API omits transactions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, count: 0 }),
      });

      const result = await fetchMoneytorTransactions();
      expect(result).toEqual([]);
    });
  });

  describe('Request URL construction', () => {
    it('places from/to/limit as query parameters on the request URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, transactions: [] }),
      });

      await fetchMoneytorTransactions({
        from: '2026-01-01',
        to: '2026-05-30',
        limit: 500,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl] = mockFetch.mock.calls[0];
      const url = new URL(calledUrl as string);

      expect(url.origin + url.pathname).toBe('https://app.moneytor.co.il/api/v1/transactions');
      expect(url.searchParams.get('from')).toBe('2026-01-01');
      expect(url.searchParams.get('to')).toBe('2026-05-30');
      expect(url.searchParams.get('limit')).toBe('500');
    });

    it('uses default limit of 2000 when not provided and omits from/to when undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, transactions: [] }),
      });

      await fetchMoneytorTransactions();

      const [calledUrl] = mockFetch.mock.calls[0];
      const url = new URL(calledUrl as string);

      expect(url.searchParams.get('limit')).toBe('2000');
      expect(url.searchParams.has('from')).toBe(false);
      expect(url.searchParams.has('to')).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('throws MoneytorApiError with code "missing_token" when MONEYTOR_API_TOKEN is missing', async () => {
      delete process.env.MONEYTOR_API_TOKEN;

      await expect(fetchMoneytorTransactions()).rejects.toMatchObject({
        name: 'MoneytorApiError',
        code: 'missing_token',
      });

      // No HTTP call should have been made.
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws code "token_expired" with populated renewUrl on 401 + api_token_expired code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          code: 'api_token_expired',
          message: 'Token expired, please renew',
          renew_url: 'https://app.moneytor.co.il/renew?u=abc',
        }),
      });

      const err = await fetchMoneytorTransactions().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(MoneytorApiError);
      const apiErr = err as MoneytorApiError;
      expect(apiErr.code).toBe('token_expired');
      expect(apiErr.status).toBe(401);
      expect(apiErr.renewUrl).toBe('https://app.moneytor.co.il/renew?u=abc');
      expect(apiErr.message).toBe('Token expired, please renew');
    });

    it('throws code "invalid_token" on 401 without api_token_expired code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          error: 'Invalid token',
        }),
      });

      const err = await fetchMoneytorTransactions().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(MoneytorApiError);
      const apiErr = err as MoneytorApiError;
      expect(apiErr.code).toBe('invalid_token');
      expect(apiErr.status).toBe(401);
      expect(apiErr.renewUrl).toBeUndefined();
    });

    it('throws code "rate_limited" on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          message: 'Too many requests',
        }),
      });

      const err = await fetchMoneytorTransactions().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(MoneytorApiError);
      const apiErr = err as MoneytorApiError;
      expect(apiErr.code).toBe('rate_limited');
      expect(apiErr.status).toBe(429);
      expect(apiErr.message).toBe('Too many requests');
    });

    it('throws code "network_error" when fetch rejects', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

      const err = await fetchMoneytorTransactions().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(MoneytorApiError);
      const apiErr = err as MoneytorApiError;
      expect(apiErr.code).toBe('network_error');
      expect(apiErr.message).toContain('ECONNRESET');
    });
  });
});
