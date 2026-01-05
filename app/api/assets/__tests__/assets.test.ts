/**
 * Integration tests for /api/assets routes
 * Tests assets summary, CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    miscAsset: {
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
import { GET as GET_SUMMARY } from '../route';
import { POST, GET as GET_LIST } from '../items/route';
import { GET as GET_BY_ID, PUT, DELETE } from '../items/[id]/route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Assets API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/assets (Summary)', () => {
    it('should return assets summary with totals', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings Account',
          currentValue: createDecimal(10000),
          interestRate: createDecimal(3.5),
          monthlyPayment: null,
          monthlyDeposit: null,
          maturityDate: new Date('2025-12-31'),
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'asset-2',
          type: 'loan',
          name: 'Car Loan',
          currentValue: createDecimal(-15000),
          interestRate: createDecimal(5.0),
          monthlyPayment: createDecimal(500),
          monthlyDeposit: null,
          maturityDate: new Date('2027-06-30'),
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);

      const response = await GET_SUMMARY();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-1');
      expect(data.data.totalAssets).toBe(10000);
      expect(data.data.totalLiabilities).toBe(15000);
      expect(data.data.netValue).toBe(-5000);
      expect(data.data.itemsCount).toBe(2);
      expect(data.data.items).toHaveLength(2);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET_SUMMARY();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle empty assets list', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET_SUMMARY();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.totalAssets).toBe(0);
      expect(data.data.totalLiabilities).toBe(0);
      expect(data.data.netValue).toBe(0);
      expect(data.data.itemsCount).toBe(0);
    });
  });

  describe('POST /api/assets/items', () => {
    it('should create bank deposit successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAsset = {
        id: 'asset-1',
        type: 'bank_deposit',
        name: 'Savings Account',
        currentValue: createDecimal(10000),
        interestRate: createDecimal(3.5),
        monthlyPayment: null,
        monthlyDeposit: null,
        maturityDate: new Date('2025-12-31'),
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.create as jest.Mock).mockResolvedValueOnce(mockAsset);

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'Savings Account',
          currentValue: 10000,
          interestRate: 3.5,
          maturityDate: '2025-12-31',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Savings Account');
      expect(data.data.type).toBe('bank_deposit');
      expect(data.data.currentValue).toBe(10000);
    });

    it('should create loan with negative value', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.create as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'loan',
        name: 'Car Loan',
        currentValue: createDecimal(-15000),
        interestRate: createDecimal(5.0),
        monthlyPayment: createDecimal(500),
        monthlyDeposit: null,
        maturityDate: null,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'loan',
          name: 'Car Loan',
          currentValue: 15000, // Positive input should be converted to negative
          interestRate: 5.0,
          monthlyPayment: 500,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify it was stored with negative value
      expect(mockPrisma.miscAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentValue: -15000,
          }),
        })
      );
    });

    it('should create child savings with monthly deposit', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.create as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'child_savings',
        name: 'College Fund',
        currentValue: createDecimal(5000),
        interestRate: createDecimal(4.0),
        monthlyPayment: null,
        monthlyDeposit: createDecimal(200),
        maturityDate: null,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'child_savings',
          name: 'College Fund',
          currentValue: 5000,
          interestRate: 4.0,
          monthlyDeposit: 200,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.monthlyDeposit).toBe(200);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'Test',
          currentValue: 1000,
          interestRate: 3,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid type', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'invalid_type',
          name: 'Test',
          currentValue: 1000,
          interestRate: 3,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Type must be one of');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          currentValue: 1000,
          interestRate: 3,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required');
    });

    it('should return 400 when currentValue is missing', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'Test',
          interestRate: 3,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Current value must be a number');
    });

    it('should return 400 for invalid interest rate', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'Test',
          currentValue: 1000,
          interestRate: 150, // > 100%
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Interest rate');
    });

    it('should return 400 when monthly payment missing for loan', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'loan',
          name: 'Test Loan',
          currentValue: 10000,
          interestRate: 5,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Monthly payment is required');
    });

    it('should return 400 for invalid maturity date format', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'Test',
          currentValue: 1000,
          interestRate: 3,
          maturityDate: 'invalid-date',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid maturity date');
    });
  });

  describe('GET /api/assets/items', () => {
    it('should return user assets list', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: createDecimal(5000),
          interestRate: createDecimal(3),
          monthlyPayment: null,
          monthlyDeposit: null,
          maturityDate: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);

      const response = await GET_LIST();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Savings');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET_LIST();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/assets/items/[id]', () => {
    it('should return single asset', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAsset = {
        id: 'asset-1',
        type: 'bank_deposit',
        name: 'Savings',
        currentValue: createDecimal(5000),
        interestRate: createDecimal(3),
        monthlyPayment: null,
        monthlyDeposit: null,
        maturityDate: null,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockAsset);

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('asset-1');
    });

    it('should return 404 when asset not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Asset not found');
    });

    it('should return 403 when user does not own asset', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/assets/items/[id]', () => {
    it('should update asset successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockExisting = {
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
      };
      const mockUpdated = {
        id: 'asset-1',
        type: 'bank_deposit',
        name: 'Updated Savings',
        currentValue: createDecimal(7500),
        interestRate: createDecimal(4.0),
        monthlyPayment: null,
        monthlyDeposit: null,
        maturityDate: null,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.miscAsset.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Savings',
          currentValue: 7500,
          interestRate: 4.0,
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Savings');
    });

    it('should normalize loan value to negative', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'loan',
        userId: 'user-1',
      });
      (mockPrisma.miscAsset.update as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'loan',
        name: 'Loan',
        currentValue: createDecimal(-8000),
        interestRate: createDecimal(5),
        monthlyPayment: createDecimal(400),
        monthlyDeposit: null,
        maturityDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({
          currentValue: 8000, // Positive should become negative
        }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });

      expect(mockPrisma.miscAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentValue: -8000,
          }),
        })
      );
    });

    it('should return 400 for empty name', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: '' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name cannot be empty');
    });

    it('should return 404 when asset not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Asset not found');
    });

    it('should return 403 when user does not own asset', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/assets/items/[id]', () => {
    it('should delete asset successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        userId: 'user-1',
      });
      (mockPrisma.miscAsset.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Asset deleted successfully');

      expect(mockPrisma.miscAsset.delete).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
      });
    });

    it('should return 404 when asset not found', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Asset not found');
    });

    it('should return 403 when user does not own asset', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });
});
