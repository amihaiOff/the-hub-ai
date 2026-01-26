/**
 * Integration tests for /api/portfolio/accounts/[id]/cash endpoints
 * Tests cash balance CRUD operations
 */

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma client
const mockPrisma = {
  stockAccount: {
    findUnique: jest.fn(),
  },
  stockAccountCash: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { PUT, DELETE } from '../[cashId]/route';

describe('Cash Balance API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockAccount = {
    id: 'account-1',
    userId: 'user-123',
    name: 'Test Account',
    currency: 'USD',
  };

  describe('GET /api/portfolio/accounts/[id]/cash', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when account not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('returns 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('returns cash balances successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.stockAccountCash.findMany.mockResolvedValue([
        { id: 'cash-1', currency: 'USD', amount: 1000, accountId: 'account-1' },
        { id: 'cash-2', currency: 'EUR', amount: 500, accountId: 'account-1' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'account-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].currency).toBe('USD');
      expect(data.data[0].amount).toBe(1000);
    });
  });

  describe('POST /api/portfolio/accounts/[id]/cash', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'USD', amount: 1000 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 for invalid currency', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'INVALID', amount: 1000 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('returns 400 for negative amount', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'USD', amount: -100 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('creates cash balance successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.stockAccountCash.upsert.mockResolvedValue({
        id: 'cash-1',
        currency: 'USD',
        amount: 1000,
        accountId: 'account-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash',
        {
          method: 'POST',
          body: JSON.stringify({ currency: 'USD', amount: 1000 }),
        }
      );
      const response = await POST(request, { params: Promise.resolve({ id: 'account-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.currency).toBe('USD');
      expect(data.data.amount).toBe(1000);
    });
  });

  describe('PUT /api/portfolio/accounts/[id]/cash/[cashId]', () => {
    const mockCashBalance = {
      id: 'cash-1',
      currency: 'USD',
      amount: 1000,
      accountId: 'account-1',
      account: mockAccount,
    };

    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when cash balance not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/invalid',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'invalid' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found');
    });

    it('returns 404 when cash belongs to different account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue({
        ...mockCashBalance,
        accountId: 'other-account',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found in this account');
    });

    it('returns 403 when user does not own account', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue({
        ...mockCashBalance,
        account: { ...mockAccount, userId: 'other-user' },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('updates cash balance successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(mockCashBalance);
      mockPrisma.stockAccountCash.update.mockResolvedValue({
        id: 'cash-1',
        currency: 'USD',
        amount: 2000,
        accountId: 'account-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.amount).toBe(2000);
    });
  });

  describe('DELETE /api/portfolio/accounts/[id]/cash/[cashId]', () => {
    const mockCashBalance = {
      id: 'cash-1',
      currency: 'USD',
      amount: 1000,
      accountId: 'account-1',
      account: mockAccount,
    };

    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when cash balance not found', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/invalid',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'invalid' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found');
    });

    it('deletes cash balance successfully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(mockCashBalance);
      mockPrisma.stockAccountCash.delete.mockResolvedValue(mockCashBalance);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Cash balance deleted successfully');
    });
  });
});
