/**
 * Integration tests for /api/assets/items/[id]/owners endpoints
 * Tests misc asset owner management with authentication and authorization
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
    miscAsset: {
      findUnique: jest.fn(),
    },
    miscAssetOwner: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
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

describe('Misc Asset Owners API', () => {
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
        name: 'Child',
        image: null,
        color: '#f59e0b',
        role: 'member' as const,
        hasUser: false,
      },
    ],
  };

  describe('GET /api/assets/items/[id]/owners', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/assets/items/invalid-id/owners');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 when no owner is in user household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const owners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890otherprofi',
          profile: {
            id: 'cm1234567890otherprofi',
            name: 'Other Person',
            image: null,
            color: '#ef4444',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(owners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return empty array for asset with no owners', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce([]);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return owners list successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const owners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890profile2abc',
          profile: {
            id: 'cm1234567890profile2abc',
            name: 'Child',
            image: null,
            color: '#f59e0b',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(owners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe('cm1234567890profile2abc');
      expect(data.data[0].name).toBe('Child');
    });

    it('should return multiple owners', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const owners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890abcdefghij',
          profile: {
            id: 'cm1234567890abcdefghij',
            name: 'Test User',
            image: 'https://example.com/avatar.png',
            color: '#3b82f6',
          },
        },
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890profile2abc',
          profile: {
            id: 'cm1234567890profile2abc',
            name: 'Child',
            image: null,
            color: '#f59e0b',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(owners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners'
      );
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });
  });

  describe('PUT /api/assets/items/[id]/owners', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/assets/items/invalid-id/owners', {
        method: 'PUT',
        body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
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
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when asset not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Asset not found');
    });

    it('should return 403 when no current owner is in user household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [{ profileId: 'cm1234567890otherprofi' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 400 for empty profileIds array', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [{ profileId: 'cm1234567890abcdefghij' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: [] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid profileId format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [{ profileId: 'cm1234567890abcdefghij' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['not-a-cuid'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 when some profiles not in household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [{ profileId: 'cm1234567890abcdefghij' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({
            profileIds: ['cm1234567890profile2abc', 'cm1234567890notinhousep'],
          }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Some profiles are not in your household');
    });

    it('should update owners successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [{ profileId: 'cm1234567890abcdefghij' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      (prisma.miscAssetOwner.deleteMany as jest.Mock).mockResolvedValueOnce({});
      (prisma.miscAssetOwner.createMany as jest.Mock).mockResolvedValueOnce({});

      const updatedOwners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890profile2abc',
          profile: {
            id: 'cm1234567890profile2abc',
            name: 'Child',
            image: null,
            color: '#f59e0b',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(updatedOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890profile2abc'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Child');
    });

    it('should allow updating owners for asset with no current owners', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Child Savings',
        owners: [],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      (prisma.miscAssetOwner.deleteMany as jest.Mock).mockResolvedValueOnce({});
      (prisma.miscAssetOwner.createMany as jest.Mock).mockResolvedValueOnce({});

      const updatedOwners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890abcdefghij',
          profile: {
            id: 'cm1234567890abcdefghij',
            name: 'Test User',
            image: 'https://example.com/avatar.png',
            color: '#3b82f6',
          },
        },
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890profile2abc',
          profile: {
            id: 'cm1234567890profile2abc',
            name: 'Child',
            image: null,
            color: '#f59e0b',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(updatedOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({
            profileIds: ['cm1234567890abcdefghij', 'cm1234567890profile2abc'],
          }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });

    it('should replace all existing owners with new list', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const asset = {
        id: 'cm1234567890assetidabc',
        name: 'Joint Asset',
        owners: [{ profileId: 'cm1234567890abcdefghij' }, { profileId: 'cm1234567890profile2abc' }],
      };

      (prisma.miscAsset.findUnique as jest.Mock).mockResolvedValueOnce(asset);

      (prisma.miscAssetOwner.deleteMany as jest.Mock).mockResolvedValueOnce({});
      (prisma.miscAssetOwner.createMany as jest.Mock).mockResolvedValueOnce({});

      const updatedOwners = [
        {
          assetId: 'cm1234567890assetidabc',
          profileId: 'cm1234567890abcdefghij',
          profile: {
            id: 'cm1234567890abcdefghij',
            name: 'Test User',
            image: 'https://example.com/avatar.png',
            color: '#3b82f6',
          },
        },
      ];

      (prisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(updatedOwners);

      const request = new NextRequest(
        'http://localhost:3000/api/assets/items/cm1234567890assetidabc/owners',
        {
          method: 'PUT',
          body: JSON.stringify({ profileIds: ['cm1234567890abcdefghij'] }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890assetidabc' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe('cm1234567890abcdefghij');
    });
  });
});
