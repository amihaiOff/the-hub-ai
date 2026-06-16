/**
 * Integration tests for /api/budget/cc-generic-payees routes
 * Tests CC generic payee names CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    ccGenericPayeeName: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
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
import { DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('CC Generic Payees API', () => {
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

  describe('GET /api/budget/cc-generic-payees', () => {
    it('should return list of CC generic payee names', async () => {
      const mockItems = [
        { id: 'item-1', name: 'Amazon', createdAt: new Date() },
        { id: 'item-2', name: 'Netflix', createdAt: new Date() },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.findMany as jest.Mock).mockResolvedValueOnce(mockItems);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Amazon');
      expect(data.data[1].name).toBe('Netflix');
    });

    it('should return 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch');
    });
  });

  describe('POST /api/budget/cc-generic-payees', () => {
    it('should create a new CC generic payee name successfully (201)', async () => {
      const mockItem = {
        id: 'item-1',
        name: 'Spotify',
        createdAt: new Date(),
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.create as jest.Mock).mockResolvedValueOnce(mockItem);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Spotify' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Spotify');
      expect(data.data.id).toBe('item-1');
    });

    it('should return 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for empty name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for missing name field', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 409 on duplicate name (Prisma P2002)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const prismaUniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      (mockPrisma.ccGenericPayeeName.create as jest.Mock).mockRejectedValueOnce(prismaUniqueError);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'Amazon' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Name already exists');
    });

    it('should return 500 on other database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.create as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection lost')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Payee' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create');
    });
  });

  describe('DELETE /api/budget/cc-generic-payees/[id]', () => {
    it('should delete successfully (200)', async () => {
      const mockExisting = {
        id: 'item-1',
        name: 'Amazon',
        householdId: 'household-1',
        createdAt: new Date(),
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.ccGenericPayeeName.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees/item-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'item-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.ccGenericPayeeName.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });

    it('should return 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees/item-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'item-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when record not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/budget/cc-generic-payees/nonexistent',
        { method: 'DELETE' }
      );

      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'item-1',
        name: 'Amazon',
        householdId: 'household-1',
        createdAt: new Date(),
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.ccGenericPayeeName.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.ccGenericPayeeName.delete as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/cc-generic-payees/item-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'item-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete CC generic payee name');
    });
  });
});
