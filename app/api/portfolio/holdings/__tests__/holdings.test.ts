/**
 * Integration tests for /api/portfolio/holdings routes
 * Tests holding CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    stockAccount: {
      findUnique: jest.fn(),
    },
    stockHolding: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

// Mock stock price API
jest.mock('@/lib/api/stock-price', () => ({
  getStockPrice: jest.fn(),
  isStockPriceError: jest.fn((result) => 'error' in result),
}));

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { getStockPrice } from '@/lib/api/stock-price';
import { POST } from '../route';
import { GET, PUT, DELETE } from '../[id]/route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetStockPrice = getStockPrice as jest.MockedFunction<typeof getStockPrice>;

describe('Portfolio Holdings API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetStockPrice.mockResolvedValue({
      symbol: 'AAPL',
      price: 175.5,
      timestamp: new Date(),
      fromCache: false,
    });
  });

  describe('POST /api/portfolio/holdings', () => {
    it('should create holding successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = { id: 'acc-1', userId: 'user-1', name: 'Test Account' };
      const mockHolding = {
        id: 'hold-1',
        accountId: 'acc-1',
        symbol: 'AAPL',
        quantity: 10,
        avgCostBasis: 150.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockAccount);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null); // No existing
      (mockPrisma.stockHolding.create as jest.Mock).mockResolvedValueOnce(mockHolding);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150.0,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('AAPL');
      expect(data.data.currentPrice).toBe(175.5);

      expect(mockPrisma.stockHolding.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150.0,
        },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when accountId is missing', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account ID is required');
    });

    it('should return 400 when symbol is missing', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Stock symbol is required');
    });

    it('should return 400 when quantity is zero or negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 0,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Quantity must be a positive number');
    });

    it('should return 400 when avgCostBasis is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: -1,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Average cost basis must be a positive number');
    });

    it('should return 400 when avgCostBasis is zero', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 0,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Average cost basis must be a positive number');
    });

    it('should return 400 when quantity is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: -5,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Quantity must be a positive number');
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'invalid',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 409 when holding already exists', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'existing',
        symbol: 'AAPL',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain('already exists');
    });

    it('should uppercase symbol', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (mockPrisma.stockHolding.create as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        symbol: 'AAPL',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'aapl',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      await POST(request);

      expect(mockPrisma.stockHolding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ symbol: 'AAPL' }),
        })
      );
    });

    it('should handle stock price API error gracefully', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (mockPrisma.stockHolding.create as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        symbol: 'AAPL',
      });
      mockGetStockPrice.mockResolvedValueOnce({
        symbol: 'AAPL',
        error: 'Failed to fetch',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // When price fetch fails, currentPrice should be null (or undefined if not set)
      expect(data.data.currentPrice === null || data.data.currentPrice === undefined).toBe(true);
    });
  });

  describe('GET /api/portfolio/holdings/[id]', () => {
    it('should return holding with account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockHolding = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: 10,
        avgCostBasis: 150,
        account: { id: 'acc-1', userId: 'user-1' },
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(mockHolding);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1');
      const response = await GET(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockHolding);
    });

    it('should return 404 when holding not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/invalid');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Holding not found');
    });

    it('should return 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1');
      const response = await GET(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/portfolio/holdings/[id]', () => {
    it('should update holding quantity', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockExisting = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: 10,
        avgCostBasis: 150,
        account: { id: 'acc-1', userId: 'user-1' },
      };
      const mockUpdated = { ...mockExisting, quantity: 20 };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.stockHolding.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ quantity: 20 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.stockHolding.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { quantity: 20 },
      });
    });

    it('should update holding cost basis', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'user-1' },
      });
      (mockPrisma.stockHolding.update as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        avgCostBasis: 175.5,
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ avgCostBasis: 175.5 }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });

      expect(mockPrisma.stockHolding.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { avgCostBasis: 175.5 },
      });
    });

    it('should update both quantity and cost basis', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'user-1' },
      });
      (mockPrisma.stockHolding.update as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        quantity: 25,
        avgCostBasis: 160,
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ quantity: 25, avgCostBasis: 160 }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });

      expect(mockPrisma.stockHolding.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { quantity: 25, avgCostBasis: 160 },
      });
    });

    it('should return 400 when quantity is zero or negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ quantity: -5 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Quantity must be a positive number');
    });

    it('should return 400 when avgCostBasis is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ avgCostBasis: -100 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Average cost basis must be a positive number');
    });

    it('should return 400 when avgCostBasis is zero', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ avgCostBasis: 0 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Average cost basis must be a positive number');
    });

    it('should return 400 when quantity is zero', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ quantity: 0 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Quantity must be a positive number');
    });

    it('should return 404 when holding not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/invalid', {
        method: 'PUT',
        body: JSON.stringify({ quantity: 10 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Holding not found');
    });

    it('should return 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        body: JSON.stringify({ quantity: 10 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/portfolio/holdings/[id]', () => {
    it('should delete holding successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'user-1' },
      });
      (mockPrisma.stockHolding.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Holding deleted successfully');

      expect(mockPrisma.stockHolding.delete).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
      });
    });

    it('should return 404 when holding not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Holding not found');
    });

    it('should return 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockHolding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'hold-1',
        account: { id: 'acc-1', userId: 'other-user' },
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/holdings/hold-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'hold-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});
