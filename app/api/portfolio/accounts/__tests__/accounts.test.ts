/**
 * Integration tests for /api/portfolio/accounts routes
 * Tests account CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    stockAccount: {
      create: jest.fn(),
      findMany: jest.fn(),
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

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { POST, GET } from '../route';
import { GET as GET_BY_ID, PUT, DELETE } from '../[id]/route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Portfolio Accounts API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /api/portfolio/accounts', () => {
    it('should create account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        name: 'Test Account',
        broker: 'Fidelity',
        currency: 'USD',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        holdings: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Account',
          broker: 'Fidelity',
          currency: 'USD',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Dates are serialized to strings in JSON response
      expect(data.data.id).toBe(mockAccount.id);
      expect(data.data.name).toBe(mockAccount.name);
      expect(data.data.broker).toBe(mockAccount.broker);
      expect(data.data.currency).toBe(mockAccount.currency);
      expect(data.data.userId).toBe(mockAccount.userId);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Account',
          broker: 'Fidelity',
          currency: 'USD',
          userId: 'user-1',
        },
        include: { holdings: true },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ broker: 'Fidelity' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account name is required');
    });

    it('should return 400 when name is empty', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account name is required');
    });

    it('should default to USD for invalid currency', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        currency: 'USD',
        userId: 'user-1',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', currency: 'INVALID' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'USD' }),
        })
      );
    });

    it('should accept valid currencies', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        currency: 'ILS',
        userId: 'user-1',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', currency: 'ILS' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'ILS' }),
        })
      );
    });

    it('should trim name and broker', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test Account',
        broker: 'Fidelity',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: '  Test Account  ',
          broker: '  Fidelity  ',
        }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Account',
            broker: 'Fidelity',
          }),
        })
      );
    });

    it('should handle null broker', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ broker: null }),
        })
      );
    });
  });

  describe('GET /api/portfolio/accounts', () => {
    it('should return user accounts', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccounts = [
        { id: 'acc-1', name: 'Account 1', _count: { holdings: 3 } },
        { id: 'acc-2', name: 'Account 2', _count: { holdings: 5 } },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockAccounts);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockAccounts);

      expect(mockPrisma.stockAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { _count: { select: { holdings: true } } },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/portfolio/accounts/[id]', () => {
    it('should return account with holdings', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        name: 'Test',
        userId: 'user-1',
        holdings: [{ id: 'hold-1', symbol: 'AAPL' }],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockAccount);
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
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

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/portfolio/accounts/[id]', () => {
    it('should update account name and broker', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockExisting = { id: 'acc-1', userId: 'user-1', name: 'Old Name' };
      const mockUpdated = {
        id: 'acc-1',
        name: 'New Name',
        broker: 'New Broker',
        userId: 'user-1',
        holdings: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name', broker: 'New Broker' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockUpdated);

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'New Name', broker: 'New Broker' },
        include: { holdings: true },
      });
    });

    it('should update only name when broker not provided', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Updated',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'Updated' },
        include: { holdings: true },
      });
    });

    it('should set broker to null when provided as null', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        broker: null,
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ broker: null }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { broker: null },
        include: { holdings: true },
      });
    });

    it('should return 400 when name is empty string', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: '' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account name cannot be empty');
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
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

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/portfolio/accounts/[id]', () => {
    it('should delete account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Account deleted successfully');

      expect(mockPrisma.stockAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
      });
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
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

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});
