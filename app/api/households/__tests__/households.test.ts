/**
 * Integration tests for /api/households endpoints
 * Tests households CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module
const mockGetCurrentContext = jest.fn();
const mockIsHouseholdAdmin = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: (...args: unknown[]) => mockGetCurrentContext(...args),
  isHouseholdAdmin: (...args: unknown[]) => mockIsHouseholdAdmin(...args),
}));

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    householdMember: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock validation
const mockValidateCuid = jest.fn();
jest.mock('@/lib/api/validation', () => ({
  validateCuid: (id: string) => mockValidateCuid(id),
}));

import { prisma } from '@/lib/db';
import { GET as GETList, POST } from '../route';
import { GET, PUT, DELETE } from '../[id]/route';

import { NextResponse } from 'next/server';

// Helper to create validation responses
const validCuid = (id: string) => ({ valid: true as const, id });
const invalidCuid = () => ({
  valid: false as const,
  response: NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 }),
});

describe('Households API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default: accept valid CUIDs
    mockValidateCuid.mockImplementation((id: string) => {
      if (id && id.length >= 20 && id.startsWith('c')) {
        return validCuid(id);
      }
      return invalidCuid();
    });
  });

  const mockContext = {
    user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'cm1234567890abcdefghij',
      name: 'Test User',
      image: 'https://example.com/avatar.png',
      color: '#3b82f6',
      userId: 'user-123',
    },
    households: [
      {
        id: 'cm1234567890household1',
        name: "Test User's Household",
        description: null,
        role: 'owner' as const,
      },
      {
        id: 'cm1234567890household2',
        name: 'Second Household',
        description: 'Another household',
        role: 'member' as const,
      },
    ],
    activeHousehold: {
      id: 'cm1234567890household1',
      name: "Test User's Household",
      description: null,
      role: 'owner' as const,
    },
    householdProfiles: [
      {
        id: 'cm1234567890abcdefghij',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        color: '#3b82f6',
        role: 'owner' as const,
        hasUser: true,
      },
    ],
  };

  describe('GET /api/households', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/households');
      const response = await GETList();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return list of households for authenticated user', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/households');
      const response = await GETList();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].id).toBe('cm1234567890household1');
      expect(data.data[1].id).toBe('cm1234567890household2');
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await GETList();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch households');
    });
  });

  describe('POST /api/households', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Household' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for invalid data - empty name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid data - name too long', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'a'.repeat(101) }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid data - description too long', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'Valid Name', description: 'a'.repeat(501) }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should create household successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const newHousehold = {
        id: 'cm1234567890newhouseh',
        name: 'New Household',
        description: 'A new household',
      };

      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (callback) => {
        const tx = {
          household: {
            create: jest.fn().mockResolvedValueOnce(newHousehold),
          },
          householdMember: {
            create: jest.fn().mockResolvedValueOnce({}),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Household', description: 'A new household' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Household');
      expect(data.data.role).toBe('owner');
    });

    it('should create household with optional description', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const newHousehold = {
        id: 'cm1234567890newhouseh',
        name: 'New Household',
        description: null,
      };

      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (callback) => {
        const tx = {
          household: {
            create: jest.fn().mockResolvedValueOnce(newHousehold),
          },
          householdMember: {
            create: jest.fn().mockResolvedValueOnce({}),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Household' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.description).toBeNull();
    });

    it('should return 500 on transaction failure', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('Transaction failed'));

      const request = new NextRequest('http://localhost:3000/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Household' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create household');
    });
  });

  describe('GET /api/households/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/households/invalid-id');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when user is not a member', async () => {
      const contextWithDifferentHousehold = {
        ...mockContext,
        households: [
          {
            id: 'cm1234567890different',
            name: 'Different Household',
            description: null,
            role: 'owner' as const,
          },
        ],
      };
      mockGetCurrentContext.mockResolvedValueOnce(contextWithDifferentHousehold);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 404 when household not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.household.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return household with members', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const householdWithMembers = {
        id: 'cm1234567890household1',
        name: "Test User's Household",
        description: null,
        members: [
          {
            role: 'owner',
            joinedAt: new Date('2024-01-01'),
            profile: {
              id: 'cm1234567890abcdefghij',
              name: 'Test User',
              image: 'https://example.com/avatar.png',
              color: '#3b82f6',
              userId: 'user-123',
            },
          },
        ],
      };

      (prisma.household.findUnique as jest.Mock).mockResolvedValueOnce(householdWithMembers);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cm1234567890household1');
      expect(data.data.members).toHaveLength(1);
      expect(data.data.members[0].role).toBe('owner');
      expect(data.data.members[0].hasUser).toBe(true);
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.household.findUnique as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch household');
    });
  });

  describe('PUT /api/households/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/households/invalid-id', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when user is not admin/owner', async () => {
      const memberContext = {
        ...mockContext,
        activeHousehold: {
          id: 'cm1234567890household1',
          name: "Test User's Household",
          description: null,
          role: 'member' as const,
        },
      };
      mockGetCurrentContext.mockResolvedValueOnce(memberContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 400 for invalid update data', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'PUT',
          body: JSON.stringify({ name: '' }), // Empty name is invalid
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should update household successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const updatedHousehold = {
        id: 'cm1234567890household1',
        name: 'Updated Household Name',
        description: 'Updated description',
      };

      (prisma.household.update as jest.Mock).mockResolvedValueOnce(updatedHousehold);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Household Name',
            description: 'Updated description',
          }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Household Name');
    });

    it('should return 500 on update failure', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.household.update as jest.Mock).mockRejectedValueOnce(new Error('Update failed'));

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to update household');
    });
  });

  describe('DELETE /api/households/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/households/invalid-id', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when user is not owner', async () => {
      const adminContext = {
        ...mockContext,
        households: [
          {
            id: 'cm1234567890household1',
            name: "Test User's Household",
            description: null,
            role: 'admin' as const, // Admin, not owner
          },
        ],
      };
      mockGetCurrentContext.mockResolvedValueOnce(adminContext);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Only household owner can delete');
    });

    it('should return 400 when trying to delete last household', async () => {
      const singleHouseholdContext = {
        ...mockContext,
        households: [
          {
            id: 'cm1234567890household1',
            name: "Test User's Household",
            description: null,
            role: 'owner' as const,
          },
        ],
      };
      mockGetCurrentContext.mockResolvedValueOnce(singleHouseholdContext);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete your only household');
    });

    it('should delete household successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.household.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.household.delete).toHaveBeenCalledWith({
        where: { id: 'cm1234567890household1' },
      });
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.household.delete as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete household');
    });
  });
});
