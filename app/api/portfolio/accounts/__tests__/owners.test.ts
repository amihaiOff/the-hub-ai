/**
 * Integration tests for /api/portfolio/accounts/[id]/owners endpoints
 * Tests stock account owner management with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module
const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: (...args: unknown[]) => mockGetCurrentContext(...args),
}));

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    stockAccount: {
      findUnique: jest.fn(),
    },
    stockAccountOwner: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock validation
const mockValidateCuid = jest.fn();
jest.mock('@/lib/api/validation', () => ({
  validateCuid: (id: string) => mockValidateCuid(id),
}));

import { prisma } from '@/lib/db';
import { GET, PUT } from '../[id]/owners/route';

import { NextResponse } from 'next/server';

// Helper to create validation responses
const validCuid = (id: string) => ({ valid: true as const, id });
const invalidCuid = () => ({
  valid: false as const,
  response: NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 }),
});

describe('Stock Account Owners API', () => {
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
      {
        id: 'cm1234567890profile2abc',
        name: 'Family Member',
        image: null,
        color: '#10b981',
        role: 'member' as const,
        hasUser: false,
      },
    ],
  };

  describe('GET /api/portfolio/accounts/[id]/owners', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/invalid-id/owners'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when no owner is in user household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Mock returns only profileId (API uses select: { profileId: true })
      const owners = [
        { profileId: 'cm1234567890otherprofi' }, // Not in household
      ];

      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(owners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return empty array for account with no owners', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return owners list successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Mock returns only profileId (API uses select: { profileId: true })
      // Profile details are looked up from householdProfiles in context
      const owners = [
        { profileId: 'cm1234567890abcdefghij' },
        { profileId: 'cm1234567890profile2abc' },
      ];

      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(owners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].id).toBe('cm1234567890abcdefghij');
      expect(data.data[1].id).toBe('cm1234567890profile2abc');
    });
  });

  describe('PUT /api/portfolio/accounts/[id]/owners', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/invalid-id/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when no current owner is in user household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners = [
        { profileId: 'cm1234567890otherprofi' }, // Not in household
      ];

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 400 for empty profileIds array', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners = [{ profileId: 'cm1234567890abcdefghij' }];

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: [] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid profileId format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners = [{ profileId: 'cm1234567890abcdefghij' }];

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['invalid-cuid'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 when some profiles not in household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners = [{ profileId: 'cm1234567890abcdefghij' }];

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({
            profileIds: ['cm1234567890abcdefghij', 'cm1234567890notinhousep'],
          }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Some profiles are not in your household');
    });

    it('should update owners successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners = [{ profileId: 'cm1234567890abcdefghij' }];

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      // First findMany call: for ownership check
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      (prisma.stockAccountOwner.deleteMany as jest.Mock).mockResolvedValueOnce({});
      // Mock individual create calls (2 owners)
      (prisma.stockAccountOwner.create as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({
            profileIds: ['cm1234567890abcdefghij', 'cm1234567890profile2abc'],
          }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });

    it('should allow updating owners for account with no current owners', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const account = {
        id: 'cm1234567890accountabc',
        name: 'Test Account',
      };
      const currentOwners: { profileId: string }[] = []; // No current owners

      (prisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(account);
      // First findMany call: for ownership check (returns empty)
      (prisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(currentOwners);

      (prisma.stockAccountOwner.deleteMany as jest.Mock).mockResolvedValueOnce({});
      // Mock individual create call (1 owner)
      (prisma.stockAccountOwner.create as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/cm1234567890accountabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890accountabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
    });
  });
});
