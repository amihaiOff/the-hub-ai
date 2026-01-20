/**
 * Integration tests for /api/stocks/price/[symbol] endpoint
 * Tests stock price fetching
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock the stock-price module
const mockGetStockPrice = jest.fn();
const mockIsStockPriceError = jest.fn();

jest.mock('@/lib/api/stock-price', () => ({
  getStockPrice: (...args: unknown[]) => mockGetStockPrice(...args),
  isStockPriceError: (result: unknown) => mockIsStockPriceError(result),
}));

import { GET } from '../[symbol]/route';

describe('Stock Price API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  describe('GET /api/stocks/price/[symbol]', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAPL');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'AAPL' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 when symbol is empty', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/');

      const response = await GET(request, { params: Promise.resolve({ symbol: '' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Stock symbol is required');
    });

    it('returns 400 when symbol is whitespace only', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/%20%20');

      const response = await GET(request, { params: Promise.resolve({ symbol: '   ' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Stock symbol is required');
    });

    it('returns 400 for invalid symbol format - too long', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAAAAAAAAAAAAAAAAAA');

      const response = await GET(request, {
        params: Promise.resolve({ symbol: 'AAAAAAAAAAAAAAAAAAA' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid stock symbol format');
    });

    it('returns 400 for invalid symbol format - special characters', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAPL$');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'AAPL$' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid stock symbol format');
    });

    it('accepts valid symbol with dots (like TEVA.TA)', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockGetStockPrice.mockResolvedValue({
        symbol: 'TEVA.TA',
        price: 150,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        fromCache: false,
      });
      mockIsStockPriceError.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/TEVA.TA');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'TEVA.TA' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('accepts valid symbol with hyphens', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockGetStockPrice.mockResolvedValue({
        symbol: 'BRK-A',
        price: 500000,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        fromCache: false,
      });
      mockIsStockPriceError.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/BRK-A');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'BRK-A' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when stock price not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockGetStockPrice.mockResolvedValue({ error: 'Stock not found' });
      mockIsStockPriceError.mockReturnValue(true);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/INVALID');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'INVALID' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Stock not found');
    });

    it('returns stock price successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockGetStockPrice.mockResolvedValue({
        symbol: 'AAPL',
        price: 175.5,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        fromCache: true,
      });
      mockIsStockPriceError.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAPL');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'AAPL' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('AAPL');
      expect(data.data.price).toBe(175.5);
      expect(data.data.fromCache).toBe(true);
    });

    it('handles top-level exception', async () => {
      mockGetCurrentUser.mockImplementation(() => {
        throw new Error('Auth service down');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAPL');

      const response = await GET(request, { params: Promise.resolve({ symbol: 'AAPL' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch stock price');

      consoleErrorSpy.mockRestore();
    });

    it('trims whitespace from symbol', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockGetStockPrice.mockResolvedValue({
        symbol: 'AAPL',
        price: 175.5,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        fromCache: false,
      });
      mockIsStockPriceError.mockReturnValue(false);

      const request = new NextRequest('http://localhost:3001/api/stocks/price/AAPL');

      await GET(request, { params: Promise.resolve({ symbol: '  AAPL  ' }) });

      expect(mockGetStockPrice).toHaveBeenCalledWith('AAPL');
    });
  });
});
