/**
 * Integration tests for /api/pension/accounts routes
 * Tests pension account CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    pensionAccount: {
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

describe('Pension Accounts API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /api/pension/accounts', () => {
    it('should create pension account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        type: 'pension',
        providerName: 'Meitav',
        accountName: 'My Pension',
        currentValue: 100000,
        feeFromDeposit: 0.5,
        feeFromTotal: 0.25,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deposits: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.create as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'My Pension',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(mockAccount.id);
      expect(data.data.type).toBe('pension');
      expect(data.data.providerName).toBe('Meitav');
      expect(data.data.currentValue).toBe(100000);
    });

    it('should create hishtalmut account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        type: 'hishtalmut',
        providerName: 'Harel',
        accountName: 'My Hishtalmut',
        currentValue: 50000,
        feeFromDeposit: 0.4,
        feeFromTotal: 0.2,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deposits: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.create as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'hishtalmut',
          providerName: 'Harel',
          accountName: 'My Hishtalmut',
          currentValue: 50000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.type).toBe('hishtalmut');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Test',
          currentValue: 10000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid type', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'invalid',
          providerName: 'Meitav',
          accountName: 'Test',
          currentValue: 10000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
      expect(data.details).toBeDefined();
    });

    it('should return 400 for missing provider name', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: '',
          accountName: 'Test',
          currentValue: 10000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid data');
      expect(data.details).toBeDefined();
    });

    it('should return 400 for negative current value', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Test',
          currentValue: -100,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid data');
      expect(data.details).toBeDefined();
    });

    it('should return 400 for fee > 100%', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Test',
          currentValue: 10000,
          feeFromDeposit: 150,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid data');
      expect(data.details).toBeDefined();
    });
  });

  describe('GET /api/pension/accounts', () => {
    it('should return all pension accounts for user', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccounts = [
        {
          id: 'acc-1',
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Pension 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          userId: 'user-1',
          _count: { deposits: 5 },
        },
        {
          id: 'acc-2',
          type: 'hishtalmut',
          providerName: 'Harel',
          accountName: 'Hishtalmut 1',
          currentValue: 50000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          userId: 'user-1',
          _count: { deposits: 3 },
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockAccounts);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].type).toBe('pension');
      expect(data.data[0].depositsCount).toBe(5);
      expect(data.data[1].type).toBe('hishtalmut');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it('should return empty array when no accounts', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });
  });

  describe('GET /api/pension/accounts/[id]', () => {
    it('should return account with deposits', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        type: 'pension',
        providerName: 'Meitav',
        accountName: 'My Pension',
        currentValue: 100000,
        feeFromDeposit: 0.5,
        feeFromTotal: 0.25,
        userId: 'user-1',
        deposits: [
          {
            id: 'd1',
            depositDate: new Date(),
            salaryMonth: new Date(),
            amount: 5000,
            employer: 'Company A',
          },
          {
            id: 'd2',
            depositDate: new Date(),
            salaryMonth: new Date(),
            amount: 5000,
            employer: 'Company A',
          },
        ],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('acc-1');
      expect(data.data.deposits).toHaveLength(2);
      expect(data.data.totalDeposits).toBe(10000);
    });

    it('should return 404 for non-existent account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when accessing another user account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-2', // Different user
        deposits: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/pension/accounts/[id]', () => {
    it('should update account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = {
        id: 'acc-1',
        userId: 'user-1',
      };
      const updatedAccount = {
        id: 'acc-1',
        type: 'pension',
        providerName: 'Updated Provider',
        accountName: 'Updated Name',
        currentValue: 150000,
        feeFromDeposit: 0.6,
        feeFromTotal: 0.3,
        userId: 'user-1',
        deposits: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);
      (mockPrisma.pensionAccount.update as jest.Mock).mockResolvedValueOnce(updatedAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({
          providerName: 'Updated Provider',
          accountName: 'Updated Name',
          currentValue: 150000,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.providerName).toBe('Updated Provider');
      expect(data.data.currentValue).toBe(150000);
    });

    it('should return 400 for empty provider name', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({
          providerName: '',
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('cannot be empty');
    });

    it('should return 404 for non-existent account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/invalid', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 100000 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
    });

    it('should return 403 when updating another user account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = {
        id: 'acc-1',
        userId: 'user-2', // Different user
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 999999 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/pension/accounts/[id]', () => {
    it('should delete account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = {
        id: 'acc-1',
        userId: 'user-1',
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);
      (mockPrisma.pensionAccount.delete as jest.Mock).mockResolvedValueOnce(existingAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.pensionAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    });

    it('should return 404 for non-existent account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
    });

    it('should return 403 when deleting another user account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = {
        id: 'acc-1',
        userId: 'user-2', // Different user
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('Database Error Handling', () => {
    it('should return 500 when database connection fails on GET', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch pension accounts');
    });

    it('should return 500 when database fails on POST', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database write failed')
      );

      const request = new NextRequest('http://localhost:3000/api/pension/accounts', {
        method: 'POST',
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Main',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it('should return 500 when database fails on PUT', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = { id: 'acc-1', userId: 'user-1' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);
      (mockPrisma.pensionAccount.update as jest.Mock).mockRejectedValueOnce(
        new Error('Database update failed')
      );

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 150000 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it('should return 500 when database fails on DELETE', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const existingAccount = { id: 'acc-1', userId: 'user-1' };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockResolvedValueOnce(existingAccount);
      (mockPrisma.pensionAccount.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database delete failed')
      );

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it('should return 500 when findUnique fails on GET single account', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.pensionAccount.findUnique as jest.Mock).mockRejectedValueOnce(
        new Error('Database query failed')
      );

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('Additional PUT Validations', () => {
    it('should return 400 for empty account name', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ accountName: '' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Account name cannot be empty');
    });

    it('should return 400 when accountName is not a string', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ accountName: 123 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Account name cannot be empty');
    });

    it('should return 400 when providerName is not a string', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ providerName: 456 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Provider name cannot be empty');
    });

    it('should return 400 when currentValue is not a number', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 'not-a-number' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Current value must be a non-negative number');
    });

    it('should return 400 when currentValue is negative', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: -1000 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('non-negative number');
    });

    it('should return 400 when feeFromDeposit is not a number', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromDeposit: 'invalid' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from deposit must be a percentage');
    });

    it('should return 400 when feeFromDeposit is negative', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromDeposit: -5 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from deposit must be a percentage between 0 and 100');
    });

    it('should return 400 when feeFromDeposit is over 100', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromDeposit: 150 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from deposit must be a percentage between 0 and 100');
    });

    it('should return 400 when feeFromTotal is not a number', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromTotal: 'invalid' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from total must be a percentage');
    });

    it('should return 400 when feeFromTotal is negative', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromTotal: -2 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from total must be a percentage between 0 and 100');
    });

    it('should return 400 when feeFromTotal is over 100', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ feeFromTotal: 200 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Fee from total must be a percentage between 0 and 100');
    });
  });

  describe('Additional Auth Tests', () => {
    it('should return 401 when not authenticated on GET single account', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when not authenticated on PUT', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 100000 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when not authenticated on DELETE', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});
