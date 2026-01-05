/**
 * Integration tests for /api/profiles endpoints
 * Tests profile CRUD operations with authentication and authorization
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
    profile: {
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

describe('Profiles API', () => {
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
        id: 'cm1234567890nonuserprof',
        name: 'Family Member',
        image: null,
        color: '#10b981',
        role: 'member' as const,
        hasUser: false,
      },
    ],
  };

  describe('GET /api/profiles', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/profiles');
      const response = await GETList(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return list of household profiles', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/profiles');
      const response = await GETList(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].id).toBe('cm1234567890abcdefghij');
      expect(data.data[1].id).toBe('cm1234567890nonuserprof');
    });

    it('should pass householdId query parameter', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest(
        'http://localhost:3000/api/profiles?householdId=cm1234567890household1'
      );
      await GETList(request);

      expect(mockGetCurrentContext).toHaveBeenCalledWith('cm1234567890household1');
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/profiles');
      const response = await GETList(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch profiles');
    });
  });

  describe('POST /api/profiles', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile' }),
      });

      const response = await POST(request);
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

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 400 for invalid data - empty name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles', {
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
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'a'.repeat(101) }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid color format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile', color: 'invalid' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should create profile successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const newProfile = {
        id: 'cm1234567890newprofile',
        name: 'New Profile',
        image: null,
        color: '#3b82f6',
      };

      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (callback) => {
        const tx = {
          profile: {
            create: jest.fn().mockResolvedValueOnce(newProfile),
          },
          householdMember: {
            create: jest.fn().mockResolvedValueOnce({}),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Profile');
      expect(data.data.role).toBe('member');
      expect(data.data.hasUser).toBe(false);
    });

    it('should create profile with custom color', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const newProfile = {
        id: 'cm1234567890newprofile',
        name: 'New Profile',
        image: null,
        color: '#ef4444',
      };

      (prisma.$transaction as jest.Mock).mockImplementationOnce(async (callback) => {
        const tx = {
          profile: {
            create: jest.fn().mockResolvedValueOnce(newProfile),
          },
          householdMember: {
            create: jest.fn().mockResolvedValueOnce({}),
          },
        };
        return callback(tx);
      });

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile', color: '#ef4444' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.color).toBe('#ef4444');
    });

    it('should return 500 on transaction failure', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('Transaction failed'));

      const request = new NextRequest('http://localhost:3000/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Profile' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create profile');
    });
  });

  describe('GET /api/profiles/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/profiles/invalid-id');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when profile not in household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890notinhouse');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890notinhouse' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return profile details', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const profile = {
        id: 'cm1234567890abcdefghij',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        color: '#3b82f6',
        userId: 'user-123',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      (prisma.profile.findUnique as jest.Mock).mockResolvedValueOnce(profile);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cm1234567890abcdefghij');
      expect(data.data.hasUser).toBe(true);
      expect(data.data.role).toBe('owner');
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.profile.findUnique as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij');
      const response = await GET(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch profile');
    });
  });

  describe('PUT /api/profiles/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/profiles/invalid-id', {
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

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 404 when profile not in household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890notinhouse', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890notinhouse' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return 403 when trying to edit another user profile', async () => {
      // Context where the profile being edited is not own profile and has a user
      const contextWithOtherUserProfile = {
        ...mockContext,
        householdProfiles: [
          ...mockContext.householdProfiles,
          {
            id: 'cm1234567890otheruserp',
            name: 'Other User',
            image: null,
            color: '#ef4444',
            role: 'member' as const,
            hasUser: true, // This profile has a user linked
          },
        ],
      };
      mockGetCurrentContext.mockResolvedValueOnce(contextWithOtherUserProfile);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890otheruserp', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890otheruserp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should allow editing own profile', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const updatedProfile = {
        id: 'cm1234567890abcdefghij',
        name: 'Updated Name',
        image: 'https://example.com/avatar.png',
        color: '#ef4444',
      };

      (prisma.profile.update as jest.Mock).mockResolvedValueOnce(updatedProfile);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', color: '#ef4444' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
    });

    it('should allow admin to edit non-user profile', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const updatedProfile = {
        id: 'cm1234567890nonuserprof',
        name: 'Updated Family Member',
        image: null,
        color: '#10b981',
      };

      (prisma.profile.update as jest.Mock).mockResolvedValueOnce(updatedProfile);

      const request = new NextRequest(
        'http://localhost:3000/api/profiles/cm1234567890nonuserprof',
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Family Member' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890nonuserprof' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Family Member');
    });

    it('should return 400 for invalid update data', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij', {
        method: 'PUT',
        body: JSON.stringify({ name: '' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 500 on update failure', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (prisma.profile.update as jest.Mock).mockRejectedValueOnce(new Error('Update failed'));

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to update profile');
    });
  });

  describe('DELETE /api/profiles/[id]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/profiles/invalid-id', {
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
        'http://localhost:3000/api/profiles/cm1234567890nonuserprof',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890nonuserprof' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when trying to delete own profile', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890abcdefghij', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890abcdefghij' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete your own profile');
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
        'http://localhost:3000/api/profiles/cm1234567890nonuserprof',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890nonuserprof' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 404 when profile not in household', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890notinhouse', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890notinhouse' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return 400 when trying to delete a user profile', async () => {
      const contextWithUserProfile = {
        ...mockContext,
        householdProfiles: [
          ...mockContext.householdProfiles,
          {
            id: 'cm1234567890otheruserp',
            name: 'Other User',
            image: null,
            color: '#ef4444',
            role: 'member' as const,
            hasUser: true,
          },
        ],
      };
      mockGetCurrentContext.mockResolvedValueOnce(contextWithUserProfile);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest('http://localhost:3000/api/profiles/cm1234567890otheruserp', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890otheruserp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete a profile linked to a user');
    });

    it('should delete non-user profile successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest(
        'http://localhost:3000/api/profiles/cm1234567890nonuserprof',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890nonuserprof' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.profile.delete).toHaveBeenCalledWith({
        where: { id: 'cm1234567890nonuserprof' },
      });
    });

    it('should return 500 on delete failure', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.delete as jest.Mock).mockRejectedValueOnce(new Error('Delete failed'));

      const request = new NextRequest(
        'http://localhost:3000/api/profiles/cm1234567890nonuserprof',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'cm1234567890nonuserprof' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to delete profile');
    });
  });
});
