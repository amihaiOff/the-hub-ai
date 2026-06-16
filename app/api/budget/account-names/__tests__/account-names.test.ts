/**
 * Integration tests for /api/budget/account-names routes.
 * Covers CRUD on account-number → name mappings plus the identifiers discovery endpoint,
 * with authentication and household scoping.
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetAccountName: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    budgetTransaction: {
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST } from '../route';
import { PUT, DELETE } from '../[id]/route';
import { GET as GET_IDENTIFIERS } from '../identifiers/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Account Names API', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
    households: [
      { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
    ],
    activeHousehold: {
      id: 'household-1',
      name: 'Test Household',
      description: null,
      role: 'owner' as const,
    },
    householdProfiles: [
      {
        id: 'profile-1',
        name: 'Test Profile',
        image: null,
        color: null,
        role: 'owner' as const,
        hasUser: true,
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/budget/account-names', () => {
    it('returns the household mappings', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'm-1', accountNumber: '111122223333', name: 'Checking' },
        { id: 'm-2', accountNumber: '999988887777', name: 'Visa' },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Checking');
      expect(mockPrisma.budgetAccountName.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { householdId: 'household-1' } })
      );
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const response = await GET();
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/budget/account-names', () => {
    it('creates a mapping (201) and trims input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.create as jest.Mock).mockResolvedValueOnce({
        id: 'm-1',
        accountNumber: '111122223333',
        name: 'Checking',
      });

      const request = new NextRequest('http://localhost/api/budget/account-names', {
        method: 'POST',
        body: JSON.stringify({ accountNumber: '  111122223333 ', name: '  Checking  ' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.budgetAccountName.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountNumber: '111122223333',
            name: 'Checking',
            householdId: 'household-1',
          }),
        })
      );
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const request = new NextRequest('http://localhost/api/budget/account-names', {
        method: 'POST',
        body: JSON.stringify({ accountNumber: '111122223333', name: 'Checking' }),
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('returns 400 when fields are missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const request = new NextRequest('http://localhost/api/budget/account-names', {
        method: 'POST',
        body: JSON.stringify({ name: 'Checking' }),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 409 on duplicate (Prisma P2002)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      (mockPrisma.budgetAccountName.create as jest.Mock).mockRejectedValueOnce(dup);

      const request = new NextRequest('http://localhost/api/budget/account-names', {
        method: 'POST',
        body: JSON.stringify({ accountNumber: '111122223333', name: 'Checking' }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('This account number already has a name');
    });
  });

  describe('PUT /api/budget/account-names/[id]', () => {
    it('renames an existing mapping', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'm-1',
        accountNumber: '111122223333',
        name: 'Old',
        householdId: 'household-1',
      });
      (mockPrisma.budgetAccountName.update as jest.Mock).mockResolvedValueOnce({
        id: 'm-1',
        accountNumber: '111122223333',
        name: 'New',
      });

      const request = new NextRequest('http://localhost/api/budget/account-names/m-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'm-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.name).toBe('New');
    });

    it('returns 404 when the mapping is not in the household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/budget/account-names/m-x', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'm-x' }) });
      expect(response.status).toBe(404);
    });

    it('returns 400 on invalid body (empty name)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const request = new NextRequest('http://localhost/api/budget/account-names/m-1', {
        method: 'PUT',
        body: JSON.stringify({ name: '' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'm-1' }) });
      expect(response.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const request = new NextRequest('http://localhost/api/budget/account-names/m-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'm-1' }) });
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/budget/account-names/[id]', () => {
    it('deletes an existing mapping', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'm-1',
        householdId: 'household-1',
      });
      (mockPrisma.budgetAccountName.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost/api/budget/account-names/m-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'm-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.budgetAccountName.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
    });

    it('returns 404 when not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetAccountName.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost/api/budget/account-names/m-x', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'm-x' }) });
      expect(response.status).toBe(404);
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const request = new NextRequest('http://localhost/api/budget/account-names/m-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'm-1' }) });
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/budget/account-names/identifiers', () => {
    it('returns distinct identifiers with counts and a sample payee, sorted by count desc', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.groupBy as jest.Mock).mockResolvedValueOnce([
        { paymentIdentifier: '111122223333', _count: { _all: 3 } },
        { paymentIdentifier: '999988887777', _count: { _all: 8 } },
      ]);
      (mockPrisma.budgetTransaction.findFirst as jest.Mock)
        .mockResolvedValueOnce({ payee: { name: 'Grocery' } })
        .mockResolvedValueOnce({ payee: { name: 'Gas Station' } });

      const response = await GET_IDENTIFIERS();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(2);
      // Sorted by count desc → 999988887777 (8) first
      expect(data.data[0]).toEqual({
        accountNumber: '999988887777',
        count: 8,
        samplePayee: 'Gas Station',
      });
      expect(data.data[1].accountNumber).toBe('111122223333');
      // groupBy filtered to household, non-deleted, non-null identifiers
      expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['paymentIdentifier'],
          where: expect.objectContaining({
            householdId: 'household-1',
            isDeleted: false,
            paymentIdentifier: { not: null },
          }),
        })
      );
    });

    it('handles a missing sample payee (samplePayee null) and an empty result', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.groupBy as jest.Mock).mockResolvedValueOnce([
        { paymentIdentifier: '111122223333', _count: { _all: 1 } },
      ]);
      // Transaction has no payee
      (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({ payee: null });

      const response = await GET_IDENTIFIERS();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].samplePayee).toBeNull();
    });

    it('returns an empty array when there are no payment identifiers', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTransaction.groupBy as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET_IDENTIFIERS();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(mockPrisma.budgetTransaction.findFirst).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const response = await GET_IDENTIFIERS();
      expect(response.status).toBe(401);
    });
  });
});
