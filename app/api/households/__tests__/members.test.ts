/**
 * Integration tests for /api/households/[id]/members endpoints
 * Tests household member management with authentication and authorization
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
    },
    householdMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock validation
const mockValidateCuid = jest.fn();
const mockValidateCuids = jest.fn();
jest.mock('@/lib/api/validation', () => ({
  validateCuid: (id: string) => mockValidateCuid(id),
  validateCuids: (ids: Record<string, string>) => mockValidateCuids(ids),
}));

import { prisma } from '@/lib/db';
import { POST } from '../[id]/members/route';
import { PUT, DELETE } from '../[id]/members/[profileId]/route';

import { NextResponse } from 'next/server';

// Helper to create validation responses
const validCuid = (id: string) => ({ valid: true as const, id });
const invalidCuid = (key: string = 'ID') => ({
  valid: false as const,
  response: NextResponse.json({ success: false, error: `Invalid ${key} format` }, { status: 400 }),
});
const validCuids = <T extends Record<string, string>>(ids: T) => ({ valid: true as const, ids });
const invalidCuids = (key: string) => ({
  valid: false as const,
  response: NextResponse.json({ success: false, error: `Invalid ${key} format` }, { status: 400 }),
});

describe('Household Members API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default: accept valid CUIDs
    mockValidateCuid.mockImplementation((id: string) => {
      if (id && id.length >= 20 && id.startsWith('c')) {
        return validCuid(id);
      }
      return invalidCuid('ID');
    });
    mockValidateCuids.mockImplementation((ids: Record<string, string>) => {
      for (const [key, value] of Object.entries(ids)) {
        if (!value || value.length < 20 || !value.startsWith('c')) {
          return invalidCuids(key);
        }
      }
      return validCuids(ids);
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
    ],
  };

  describe('POST /api/households/[id]/members', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/households/invalid-id/members', {
        method: 'POST',
        body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'invalid-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid ID format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
        }
      );
      const response = await POST(request, {
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
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 400 for invalid profileId format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'not-a-cuid', role: 'member' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 400 for invalid role', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'owner' }), // Can't add as owner
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should return 404 when profile not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Profile not found');
    });

    it('should return 400 when profile is already a member', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'cm1234567890newprofile',
        name: 'New Profile',
      });
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'member',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Profile is already a member');
    });

    it('should add member successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'cm1234567890newprofile',
        name: 'New Profile',
      });
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const newMember = {
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'member',
        joinedAt: new Date('2024-01-01'),
        profile: {
          id: 'cm1234567890newprofile',
          name: 'New Profile',
          image: null,
          color: '#10b981',
          userId: null,
        },
      };

      (prisma.householdMember.create as jest.Mock).mockResolvedValueOnce(newMember);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'member' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('cm1234567890newprofile');
      expect(data.data.role).toBe('member');
      expect(data.data.hasUser).toBe(false);
    });

    it('should add member as admin when specified', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'cm1234567890newprofile',
        name: 'New Profile',
      });
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const newMember = {
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'admin',
        joinedAt: new Date('2024-01-01'),
        profile: {
          id: 'cm1234567890newprofile',
          name: 'New Profile',
          image: null,
          color: '#10b981',
          userId: 'user-456',
        },
      };

      (prisma.householdMember.create as jest.Mock).mockResolvedValueOnce(newMember);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members',
        {
          method: 'POST',
          body: JSON.stringify({ profileId: 'cm1234567890newprofile', role: 'admin' }),
        }
      );
      const response = await POST(request, {
        params: Promise.resolve({ id: 'cm1234567890household1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.role).toBe('admin');
      expect(data.data.hasUser).toBe(true);
    });
  });

  describe('PUT /api/households/[id]/members/[profileId]', () => {
    it('should return 400 for invalid household CUID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/households/invalid-id/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'invalid-id', profileId: 'cm1234567890newprofile' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid householdId format');
    });

    it('should return 400 for invalid profile CUID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/invalid-id',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'cm1234567890household1', profileId: 'invalid-id' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid profileId format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
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
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 404 when member not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Member not found');
    });

    it('should return 400 when trying to change owner role', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890ownerprofi',
        role: 'owner',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890ownerprofi',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890ownerprofi',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot change owner role');
    });

    it('should return 400 for invalid role value', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'member',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'owner' }), // Can't set to owner
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('should update member role successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'member',
      });

      const updatedMembership = {
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'admin',
        profile: {
          id: 'cm1234567890newprofile',
          name: 'New Profile',
          image: null,
          color: '#10b981',
          userId: 'user-456',
        },
      };

      (prisma.householdMember.update as jest.Mock).mockResolvedValueOnce(updatedMembership);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'PUT',
          body: JSON.stringify({ role: 'admin' }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.role).toBe('admin');
    });
  });

  describe('DELETE /api/households/[id]/members/[profileId]', () => {
    it('should return 400 for invalid CUID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/households/invalid-id/members/cm1234567890newprofile',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'invalid-id', profileId: 'cm1234567890newprofile' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid householdId format');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
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
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 404 when member not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Member not found');
    });

    it('should return 400 when trying to remove owner', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890ownerprofi',
        role: 'owner',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890ownerprofi',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890ownerprofi',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot remove household owner');
    });

    it('should delete member successfully', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockIsHouseholdAdmin.mockReturnValueOnce(true);
      (prisma.householdMember.findUnique as jest.Mock).mockResolvedValueOnce({
        householdId: 'cm1234567890household1',
        profileId: 'cm1234567890newprofile',
        role: 'member',
      });
      (prisma.householdMember.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest(
        'http://localhost:3000/api/households/cm1234567890household1/members/cm1234567890newprofile',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({
          id: 'cm1234567890household1',
          profileId: 'cm1234567890newprofile',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(prisma.householdMember.delete).toHaveBeenCalledWith({
        where: {
          householdId_profileId: {
            householdId: 'cm1234567890household1',
            profileId: 'cm1234567890newprofile',
          },
        },
      });
    });
  });
});
