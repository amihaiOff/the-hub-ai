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

// Mock Prisma client with transaction support
const mockTransaction = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    miscAsset: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    mortgageTrack: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: mockTransaction,
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
    // Reset transaction mock to execute callback by default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockMortgageTrack = (prisma as any).mortgageTrack;
    mockTransaction.mockImplementation(async (callback) => {
      return callback({
        miscAsset: mockPrisma.miscAsset,
        mortgageTrack: mockMortgageTrack,
      });
    });
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
          owners: [],
          mortgageTracks: [],
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
          owners: [],
          mortgageTracks: [],
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
        mortgageTracks: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      // Mock the transaction to handle the create and findUnique calls
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            create: jest.fn().mockResolvedValue({ id: 'asset-1' }),
            findUnique: jest.fn().mockResolvedValue(mockAsset),
          },
          mortgageTrack: {
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

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

      let capturedCreateData: unknown = null;
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            create: jest.fn().mockImplementation((args) => {
              capturedCreateData = args.data;
              return Promise.resolve({ id: 'asset-1' });
            }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            createMany: jest.fn(),
          },
        };
        return callback(tx);
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
      expect(capturedCreateData).toMatchObject({
        currentValue: -15000,
      });
    });

    it('should create child savings with monthly deposit', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            create: jest.fn().mockResolvedValue({ id: 'asset-1' }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            createMany: jest.fn(),
          },
        };
        return callback(tx);
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
          mortgageTracks: [],
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
        mortgageTracks: [],
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
        mortgageTracks: [],
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
        mortgageTracks: [],
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockResolvedValue({ id: 'asset-1' }),
            findUnique: jest.fn().mockResolvedValue(mockUpdated),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

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
        mortgageTracks: [],
      });

      let capturedUpdateData: unknown = null;
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockImplementation((args) => {
              capturedUpdateData = args.data;
              return Promise.resolve({ id: 'asset-1' });
            }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({
          currentValue: 8000, // Positive should become negative
        }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });

      expect(capturedUpdateData).toMatchObject({
        currentValue: -8000,
      });
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

  describe('PUT /api/assets/items/[id] - Additional validations', () => {
    it('should return 400 when name is defined but not a string', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 123 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name cannot be empty');
    });

    it('should return 400 when name exceeds max length', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const longName = 'a'.repeat(300);
      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: longName }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('at most');
    });

    it('should return 400 when currentValue is not a number', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 'not-a-number' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Current value must be a number');
    });

    it('should return 400 when interestRate is not a number', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ interestRate: 'invalid' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Interest rate');
    });

    it('should return 400 when interestRate is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ interestRate: -5 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Interest rate');
    });

    it('should return 400 when interestRate is over 100', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ interestRate: 150 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Interest rate');
    });

    it('should return 400 when monthlyPayment is not a number', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyPayment: 'invalid' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Monthly payment');
    });

    it('should return 400 when monthlyPayment is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyPayment: -100 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Monthly payment');
    });

    it('should return 400 when monthlyDeposit is not a number', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyDeposit: 'invalid' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Monthly deposit');
    });

    it('should return 400 when monthlyDeposit is negative', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyDeposit: -50 }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Monthly deposit');
    });

    it('should accept null maturityDate to clear the date', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
        mortgageTracks: [],
      });

      let capturedUpdateData: unknown = null;
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockImplementation((args) => {
              capturedUpdateData = args.data;
              return Promise.resolve({ id: 'asset-1' });
            }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ maturityDate: null }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(capturedUpdateData).toMatchObject({ maturityDate: null });
    });

    it('should return 400 for invalid maturity date format in update', async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
      });
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ maturityDate: 'not-a-date' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid maturity date');
    });

    it('should normalize mortgage value to negative', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'mortgage',
        userId: 'user-1',
        mortgageTracks: [],
      });

      let capturedUpdateData: unknown = null;
      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockImplementation((args) => {
              capturedUpdateData = args.data;
              return Promise.resolve({ id: 'asset-1' });
            }),
            findUnique: jest.fn().mockResolvedValue({
              id: 'asset-1',
              type: 'mortgage',
              name: 'Home Mortgage',
              currentValue: createDecimal(-250000),
              interestRate: createDecimal(4.5),
              monthlyPayment: createDecimal(1500),
              monthlyDeposit: null,
              maturityDate: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ currentValue: 250000 }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });

      expect(capturedUpdateData).toMatchObject({ currentValue: -250000 });
    });

    it('should allow null monthlyPayment', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
        mortgageTracks: [],
      });

      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockResolvedValue({ id: 'asset-1' }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyPayment: null }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });

      expect(response.status).toBe(200);
    });

    it('should allow null monthlyDeposit', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
        mortgageTracks: [],
      });

      mockTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          miscAsset: {
            update: jest.fn().mockResolvedValue({ id: 'asset-1' }),
            findUnique: jest.fn().mockResolvedValue({
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
              mortgageTracks: [],
            }),
          },
          mortgageTrack: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ monthlyDeposit: null }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });

      expect(response.status).toBe(200);
    });

    it('should return 401 when not authenticated on PUT', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/assets/items/[id] - Additional tests', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when database fails on GET single asset', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch asset');
    });

    it('should return 500 when database fails on PUT', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        type: 'bank_deposit',
        userId: 'user-1',
      });
      (mockPrisma.miscAsset.update as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to update asset');
    });

    it('should return 500 when database fails on DELETE', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'asset-1',
        userId: 'user-1',
      });
      (mockPrisma.miscAsset.delete as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/assets/items/asset-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete asset');
    });
  });

  // ============================================
  // Mortgage Tracks Tests
  // ============================================

  describe('Mortgage Tracks Feature', () => {
    describe('POST /api/assets/items - Create Mortgage with Tracks', () => {
      it('should create mortgage with multiple tracks', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockCreatedAsset = {
          id: 'mortgage-1',
          type: 'mortgage',
          name: 'Home Mortgage',
          currentValue: createDecimal(-450000),
          interestRate: createDecimal(4.67), // Weighted average
          monthlyPayment: createDecimal(2900),
          monthlyDeposit: null,
          maturityDate: null,
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          mortgageTracks: [
            {
              id: 'track-1',
              name: 'Fixed Rate',
              amount: createDecimal(200000),
              interestRate: createDecimal(4.5),
              monthlyPayment: createDecimal(1500),
              maturityDate: null,
              sortOrder: 0,
            },
            {
              id: 'track-2',
              name: 'Prime',
              amount: createDecimal(150000),
              interestRate: createDecimal(5.0),
              monthlyPayment: createDecimal(800),
              maturityDate: null,
              sortOrder: 1,
            },
            {
              id: 'track-3',
              name: 'Variable',
              amount: createDecimal(100000),
              interestRate: createDecimal(4.5),
              monthlyPayment: createDecimal(600),
              maturityDate: null,
              sortOrder: 2,
            },
          ],
        };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              create: jest.fn().mockResolvedValue({
                id: 'mortgage-1',
                type: 'mortgage',
                name: 'Home Mortgage',
                currentValue: createDecimal(-450000),
                interestRate: createDecimal(4.67),
                monthlyPayment: createDecimal(2900),
              }),
              findUnique: jest.fn().mockResolvedValue(mockCreatedAsset),
            },
            mortgageTrack: {
              createMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 450000,
            interestRate: 4.5, // Will be overwritten by weighted avg
            tracks: [
              {
                name: 'Fixed Rate',
                amount: 200000,
                interestRate: 4.5,
                monthlyPayment: 1500,
              },
              {
                name: 'Prime',
                amount: 150000,
                interestRate: 5.0,
                monthlyPayment: 800,
              },
              {
                name: 'Variable',
                amount: 100000,
                interestRate: 4.5,
                monthlyPayment: 600,
              },
            ],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.mortgageTracks).toHaveLength(3);
        expect(data.data.mortgageTracks[0].name).toBe('Fixed Rate');
        expect(data.data.mortgageTracks[0].amount).toBe(200000);
      });

      it('should calculate aggregate values from tracks', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              create: jest.fn().mockImplementation((args) => {
                // Verify the calculated values are correct
                expect(args.data.currentValue).toBe(-300000); // Sum: 200000 + 100000, negated
                // Weighted avg: (200000 * 4.5 + 100000 * 6.0) / 300000 = 5.0
                expect(args.data.interestRate).toBe(5.0);
                expect(args.data.monthlyPayment).toBe(2300); // 1500 + 800
                return Promise.resolve({ id: 'mortgage-1' });
              }),
              findUnique: jest.fn().mockResolvedValue({
                id: 'mortgage-1',
                type: 'mortgage',
                name: 'Test Mortgage',
                currentValue: createDecimal(-300000),
                interestRate: createDecimal(5.0),
                monthlyPayment: createDecimal(2300),
                monthlyDeposit: null,
                maturityDate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                mortgageTracks: [],
              }),
            },
            mortgageTrack: {
              createMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Test Mortgage',
            currentValue: 999999, // Should be overwritten by track sum
            interestRate: 1.0, // Should be overwritten by weighted average
            tracks: [
              { name: 'Fixed', amount: 200000, interestRate: 4.5, monthlyPayment: 1500 },
              { name: 'Prime', amount: 100000, interestRate: 6.0, monthlyPayment: 800 },
            ],
          }),
        });

        await POST(request);
      });

      it('should allow mortgage without tracks (requires monthlyPayment)', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              create: jest.fn().mockResolvedValue({ id: 'mortgage-1' }),
              findUnique: jest.fn().mockResolvedValue({
                id: 'mortgage-1',
                type: 'mortgage',
                name: 'Simple Mortgage',
                currentValue: createDecimal(-200000),
                interestRate: createDecimal(5.0),
                monthlyPayment: createDecimal(1500),
                monthlyDeposit: null,
                maturityDate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                mortgageTracks: [],
              }),
            },
            mortgageTrack: {
              createMany: jest.fn(),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Simple Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            monthlyPayment: 1500,
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.mortgageTracks).toHaveLength(0);
      });

      it('should return 400 when mortgage has no tracks and no monthlyPayment', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Invalid Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            // No monthlyPayment and no tracks
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Monthly payment is required');
      });

      it('should return 400 when tracks are added to non-mortgage type', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'loan',
            name: 'Car Loan',
            currentValue: 15000,
            interestRate: 5.0,
            monthlyPayment: 500,
            tracks: [{ name: 'Track 1', amount: 10000, interestRate: 5.0 }],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Tracks can only be added to mortgages');
      });
    });

    describe('Track Validation', () => {
      it('should return 400 when track name is missing', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [
              { amount: 200000, interestRate: 4.5, monthlyPayment: 1500 }, // Missing name
            ],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track name is required');
      });

      it('should return 400 when track amount is missing', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [
              { name: 'Fixed', interestRate: 4.5, monthlyPayment: 1500 }, // Missing amount
            ],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track amount');
      });

      it('should return 400 when track interest rate is missing', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [
              { name: 'Fixed', amount: 200000, monthlyPayment: 1500 }, // Missing interestRate
            ],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track interest rate');
      });

      it('should return 400 when track interest rate is negative', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [{ name: 'Fixed', amount: 200000, interestRate: -5, monthlyPayment: 1500 }],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track interest rate');
      });

      it('should return 400 when track interest rate exceeds 100', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [{ name: 'Fixed', amount: 200000, interestRate: 150, monthlyPayment: 1500 }],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track interest rate');
      });

      it('should return 400 when track amount is negative', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        mockGetCurrentUser.mockResolvedValueOnce(mockUser);

        const request = new NextRequest('http://localhost:3000/api/assets/items', {
          method: 'POST',
          body: JSON.stringify({
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: 200000,
            interestRate: 5.0,
            tracks: [{ name: 'Fixed', amount: -200000, interestRate: 4.5, monthlyPayment: 1500 }],
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('Track amount');
      });
    });

    describe('PUT /api/assets/items/[id] - Update Mortgage Tracks', () => {
      it('should update mortgage tracks (replace all)', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockExisting = {
          id: 'mortgage-1',
          type: 'mortgage',
          userId: 'user-1',
          mortgageTracks: [{ id: 'old-track-1', name: 'Old Track', amount: createDecimal(100000) }],
        };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        // First findUnique call is outside transaction (to verify ownership)
        (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);

        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              update: jest.fn().mockResolvedValue({ id: 'mortgage-1' }),
              findUnique: jest.fn().mockResolvedValue({
                id: 'mortgage-1',
                type: 'mortgage',
                name: 'Updated Mortgage',
                currentValue: createDecimal(-300000),
                interestRate: createDecimal(5.0),
                monthlyPayment: createDecimal(2300),
                monthlyDeposit: null,
                maturityDate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                mortgageTracks: [
                  {
                    id: 'new-track-1',
                    name: 'New Fixed',
                    amount: createDecimal(200000),
                    interestRate: createDecimal(4.5),
                    monthlyPayment: createDecimal(1500),
                    maturityDate: null,
                    sortOrder: 0,
                  },
                  {
                    id: 'new-track-2',
                    name: 'New Prime',
                    amount: createDecimal(100000),
                    interestRate: createDecimal(6.0),
                    monthlyPayment: createDecimal(800),
                    maturityDate: null,
                    sortOrder: 1,
                  },
                ],
              }),
            },
            mortgageTrack: {
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
              createMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items/mortgage-1', {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Mortgage',
            tracks: [
              { name: 'New Fixed', amount: 200000, interestRate: 4.5, monthlyPayment: 1500 },
              { name: 'New Prime', amount: 100000, interestRate: 6.0, monthlyPayment: 800 },
            ],
          }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: 'mortgage-1' }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.mortgageTracks).toHaveLength(2);
      });

      it('should clear tracks when empty array provided', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockExisting = {
          id: 'mortgage-1',
          type: 'mortgage',
          userId: 'user-1',
          mortgageTracks: [{ id: 'track-1', name: 'Track 1' }],
        };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              update: jest.fn().mockResolvedValue({ id: 'mortgage-1' }),
              findUnique: jest.fn().mockResolvedValue({
                id: 'mortgage-1',
                type: 'mortgage',
                name: 'Mortgage',
                currentValue: createDecimal(-200000),
                interestRate: createDecimal(5.0),
                monthlyPayment: createDecimal(1500),
                monthlyDeposit: null,
                maturityDate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                mortgageTracks: [],
              }),
            },
            mortgageTrack: {
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
              createMany: jest.fn(),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items/mortgage-1', {
          method: 'PUT',
          body: JSON.stringify({
            tracks: [],
            monthlyPayment: 1500, // Required when no tracks
          }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: 'mortgage-1' }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.mortgageTracks).toHaveLength(0);
      });

      it('should not modify tracks when tracks field not provided in update', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockExisting = {
          id: 'mortgage-1',
          type: 'mortgage',
          userId: 'user-1',
          mortgageTracks: [
            {
              id: 'track-1',
              name: 'Existing Track',
              amount: createDecimal(100000),
              interestRate: createDecimal(4.5),
              monthlyPayment: createDecimal(800),
              maturityDate: null,
              sortOrder: 0,
            },
          ],
        };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
        mockTransaction.mockImplementationOnce(async (callback) => {
          const tx = {
            miscAsset: {
              update: jest.fn().mockResolvedValue({ id: 'mortgage-1' }),
              findUnique: jest.fn().mockResolvedValue({
                ...mockExisting,
                name: 'Updated Name',
                currentValue: createDecimal(-100000),
                interestRate: createDecimal(4.5),
                monthlyPayment: createDecimal(800),
                monthlyDeposit: null,
                maturityDate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            },
            mortgageTrack: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
          };
          return callback(tx);
        });

        const request = new NextRequest('http://localhost:3000/api/assets/items/mortgage-1', {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Name',
            // No tracks field - should preserve existing
          }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: 'mortgage-1' }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      });
    });

    describe('GET /api/assets/items - Retrieve Mortgage with Tracks', () => {
      it('should return mortgage with tracks in list', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockAssets = [
          {
            id: 'mortgage-1',
            type: 'mortgage',
            name: 'Home Mortgage',
            currentValue: createDecimal(-300000),
            interestRate: createDecimal(5.0),
            monthlyPayment: createDecimal(2000),
            monthlyDeposit: null,
            maturityDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            mortgageTracks: [
              {
                id: 'track-1',
                name: 'Fixed',
                amount: createDecimal(200000),
                interestRate: createDecimal(4.5),
                monthlyPayment: createDecimal(1200),
                maturityDate: null,
                sortOrder: 0,
              },
              {
                id: 'track-2',
                name: 'Prime',
                amount: createDecimal(100000),
                interestRate: createDecimal(6.0),
                monthlyPayment: createDecimal(800),
                maturityDate: null,
                sortOrder: 1,
              },
            ],
          },
        ];

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);

        const response = await GET_LIST();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data[0].mortgageTracks).toHaveLength(2);
        expect(data.data[0].mortgageTracks[0].name).toBe('Fixed');
        expect(data.data[0].mortgageTracks[0].amount).toBe(200000);
      });

      it('should return empty tracks array for non-mortgage assets', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockAssets = [
          {
            id: 'deposit-1',
            type: 'bank_deposit',
            name: 'Savings',
            currentValue: createDecimal(10000),
            interestRate: createDecimal(3.0),
            monthlyPayment: null,
            monthlyDeposit: null,
            maturityDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            mortgageTracks: [],
          },
        ];

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockAssets);

        const response = await GET_LIST();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data[0].mortgageTracks).toHaveLength(0);
      });
    });

    describe('GET /api/assets/items/[id] - Retrieve Single Mortgage with Tracks', () => {
      it('should return single mortgage with tracks', async () => {
        const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
        const mockAsset = {
          id: 'mortgage-1',
          type: 'mortgage',
          name: 'Home Mortgage',
          currentValue: createDecimal(-300000),
          interestRate: createDecimal(5.0),
          monthlyPayment: createDecimal(2000),
          monthlyDeposit: null,
          maturityDate: new Date('2045-01-15'),
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          mortgageTracks: [
            {
              id: 'track-1',
              name: 'Fixed Rate',
              amount: createDecimal(200000),
              interestRate: createDecimal(4.5),
              monthlyPayment: createDecimal(1200),
              maturityDate: new Date('2045-01-15'),
              sortOrder: 0,
            },
          ],
        };

        mockGetCurrentUser.mockResolvedValueOnce(mockUser);
        (mockPrisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(mockAsset);

        const request = new NextRequest('http://localhost:3000/api/assets/items/mortgage-1');
        const response = await GET_BY_ID(request, {
          params: Promise.resolve({ id: 'mortgage-1' }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.mortgageTracks).toHaveLength(1);
        expect(data.data.mortgageTracks[0].name).toBe('Fixed Rate');
        expect(data.data.mortgageTracks[0].maturityDate).toBeTruthy();
      });
    });
  });
});
