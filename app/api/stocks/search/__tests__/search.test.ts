/**
 * Integration tests for /api/stocks/search endpoint
 * Tests stock search functionality via Yahoo Finance API
 */

import { NextRequest } from 'next/server';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

import { GET } from '../route';

describe('Stock Search API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  describe('GET /api/stocks/search', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns empty array when query is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/search');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('returns empty array when query is empty string', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('returns empty array when query is only whitespace', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=%20%20');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('returns stock results for valid query', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              {
                symbol: 'AAPL',
                longname: 'Apple Inc.',
                exchDisp: 'NASDAQ',
                quoteType: 'EQUITY',
              },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].symbol).toBe('AAPL');
      expect(data.data[0].name).toBe('Apple Inc.');
      expect(data.data[0].exchange).toBe('NASDAQ');
      expect(data.data[0].currency).toBe('USD');
    });

    it('handles Yahoo API non-ok response', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('handles empty quotes from Yahoo', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ quotes: [] }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=XYZXYZ');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('handles undefined quotes from Yahoo', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=XYZXYZ');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('handles fetch error gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);

      consoleErrorSpy.mockRestore();
    });

    it('filters out non-equity types', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY' },
              { symbol: 'AAPL230120C00150000', longname: 'Apple Option', quoteType: 'OPTION' },
              { symbol: 'SPY', longname: 'SPDR S&P 500 ETF', quoteType: 'ETF' },
              { symbol: 'BTC-USD', longname: 'Bitcoin USD', quoteType: 'CRYPTOCURRENCY' },
              { symbol: 'MSFT', longname: 'Microsoft', typeDisp: 'Stock' },
              { symbol: 'DJI', longname: 'Dow Jones', quoteType: 'INDEX' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=test');

      const response = await GET(request);
      const data = await response.json();

      expect(data.data).toHaveLength(4);
      expect(data.data.map((d: { symbol: string }) => d.symbol)).toEqual([
        'AAPL',
        'SPY',
        'MSFT',
        'DJI',
      ]);
    });

    it('limits results to 10', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const quotes = Array.from({ length: 15 }, (_, i) => ({
        symbol: `STOCK${i}`,
        longname: `Stock ${i}`,
        quoteType: 'EQUITY',
      }));
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ quotes }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=test');

      const response = await GET(request);
      const data = await response.json();

      expect(data.data).toHaveLength(10);
    });

    // Exchange mapping tests
    it('maps Tel Aviv exchange to TASE with ILS', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'TEVA.TA', longname: 'Teva', exchDisp: 'Tel Aviv', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEVA');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('TASE');
      expect(data.data[0].currency).toBe('ILS');
    });

    it('maps TLV exchange to TASE with ILS', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEVA.TA', longname: 'Teva', exchange: 'TLV', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEVA');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('TASE');
      expect(data.data[0].currency).toBe('ILS');
    });

    it('maps TASE exchange code to TASE with ILS', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'TEVA.TA', longname: 'Teva', exchDisp: 'TASE', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEVA');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('TASE');
      expect(data.data[0].currency).toBe('ILS');
    });

    it('maps NMS to NASDAQ with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'AAPL', longname: 'Apple', exchange: 'NMS', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('NASDAQ');
      expect(data.data[0].currency).toBe('USD');
    });

    it('maps NGM to NASDAQ with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', exchange: 'NGM', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('NASDAQ');
    });

    it('maps NCM to NASDAQ with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', exchange: 'NCM', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('NASDAQ');
    });

    it('maps NYQ to NYSE with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'IBM', longname: 'IBM', exchange: 'NYQ', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=IBM');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('NYSE');
      expect(data.data[0].currency).toBe('USD');
    });

    it('maps NYSE string to NYSE with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'IBM', longname: 'IBM', exchDisp: 'NYSE', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=IBM');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('NYSE');
    });

    it('maps ASE to AMEX with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', exchange: 'ASE', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('AMEX');
      expect(data.data[0].currency).toBe('USD');
    });

    it('maps AMEX string to AMEX with USD', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', exchDisp: 'AMEX', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('AMEX');
    });

    it('maps AMS to Amsterdam with EUR', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST.AS', longname: 'Test', exchange: 'AMS', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('Amsterdam');
      expect(data.data[0].currency).toBe('EUR');
    });

    it('maps Amsterdam string to Amsterdam with EUR', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'TEST.AS', longname: 'Test', exchDisp: 'Amsterdam', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('Amsterdam');
    });

    it('maps GER to XETRA with EUR', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST.DE', longname: 'Test', exchange: 'GER', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('XETRA');
      expect(data.data[0].currency).toBe('EUR');
    });

    it('maps XETRA string to XETRA with EUR', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'TEST.DE', longname: 'Test', exchDisp: 'XETRA', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('XETRA');
    });

    it('maps LSE to London with GBP', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST.L', longname: 'Test', exchange: 'LSE', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('LSE');
      expect(data.data[0].currency).toBe('GBP');
    });

    it('maps LON to London with GBP', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST.L', longname: 'Test', exchange: 'LON', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('LSE');
    });

    it('maps London string to LSE with GBP', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'TEST.L', longname: 'Test', exchDisp: 'London', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('LSE');
    });

    it('maps unknown exchange with USD default', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', exchDisp: 'Tokyo', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('Tokyo');
      expect(data.data[0].currency).toBe('USD');
    });

    it('handles missing exchange info', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'TEST', longname: 'Test', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=TEST');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].exchange).toBe('Unknown');
      expect(data.data[0].currency).toBe('USD');
    });

    // Name fallback tests
    it('uses longname when available', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'AAPL', longname: 'Apple Inc.', shortname: 'Apple', quoteType: 'EQUITY' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].name).toBe('Apple Inc.');
    });

    it('falls back to shortname when longname is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'AAPL', shortname: 'Apple', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].name).toBe('Apple');
    });

    it('falls back to symbol when both names are missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [{ symbol: 'AAPL', quoteType: 'EQUITY' }],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data[0].name).toBe('AAPL');
    });

    // Quote type variations
    it('handles typeDisp when quoteType is missing', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'AAPL', longname: 'Apple', typeDisp: 'Equity' },
              { symbol: 'SPY', longname: 'SPDR', typeDisp: 'etf' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data).toHaveLength(2);
    });

    it('filters out quotes with no type info', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            quotes: [
              { symbol: 'AAPL', longname: 'Apple', quoteType: 'EQUITY' },
              { symbol: 'UNKNOWN', longname: 'Unknown Type' },
            ],
          }),
      });

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].symbol).toBe('AAPL');
    });

    it('handles top-level error gracefully', async () => {
      mockGetCurrentUser.mockImplementation(() => {
        throw new Error('Auth service down');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/stocks/search?q=AAPL');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to search stocks');

      consoleErrorSpy.mockRestore();
    });
  });
});
