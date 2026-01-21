/**
 * Integration tests for /api/onboarding endpoint
 * Tests onboarding flow including profile, household, and family member creation
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma client
const mockPrisma = {
  profile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  household: {
    create: jest.fn(),
  },
  householdMember: {
    create: jest.fn(),
  },
  stockAccount: {
    findMany: jest.fn(),
  },
  pensionAccount: {
    findMany: jest.fn(),
  },
  miscAsset: {
    findMany: jest.fn(),
  },
  stockAccountOwner: {
    create: jest.fn(),
  },
  pensionAccountOwner: {
    create: jest.fn(),
  },
  miscAssetOwner: {
    create: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { POST } from '../route';

describe('Onboarding API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const validOnboardingData = {
    profileName: 'Test User',
    profileColor: '#3b82f6',
    householdName: "Test User's Household",
    familyMembers: [],
  };

  describe('POST /api/onboarding', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 when user already has a profile', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 'existing-profile-id',
        name: 'Existing Profile',
      });

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User already has a profile');
    });

    it('returns 400 for invalid data - empty profile name', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          profileName: '',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('returns 400 for invalid data - invalid color format', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          profileColor: 'invalid-color',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('returns 400 for invalid data - empty household name', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          householdName: '',
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('returns 400 for invalid family member data', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          familyMembers: [{ name: '', color: '#3b82f6' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('successfully creates profile and household without family members', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
        color: '#3b82f6',
        userId: 'user-123',
      });
      mockPrisma.household.create.mockResolvedValue({
        id: 'new-household-id',
        name: "Test User's Household",
      });
      mockPrisma.householdMember.create.mockResolvedValue({
        id: 'new-member-id',
        householdId: 'new-household-id',
        profileId: 'new-profile-id',
        role: 'owner',
      });
      mockPrisma.stockAccount.findMany.mockResolvedValue([]);
      mockPrisma.pensionAccount.findMany.mockResolvedValue([]);
      mockPrisma.miscAsset.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.profileId).toBe('new-profile-id');
      expect(data.data.householdId).toBe('new-household-id');
      expect(data.data.familyProfileIds).toEqual([]);
    });

    it('successfully creates profile, household, and family members', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create
        .mockResolvedValueOnce({
          id: 'new-profile-id',
          name: 'Test User',
          color: '#3b82f6',
          userId: 'user-123',
        })
        .mockResolvedValueOnce({
          id: 'family-profile-1',
          name: 'Spouse',
          color: '#10b981',
        });
      mockPrisma.household.create.mockResolvedValue({
        id: 'new-household-id',
        name: "Test User's Household",
      });
      mockPrisma.householdMember.create.mockResolvedValue({
        id: 'new-member-id',
      });
      mockPrisma.stockAccount.findMany.mockResolvedValue([]);
      mockPrisma.pensionAccount.findMany.mockResolvedValue([]);
      mockPrisma.miscAsset.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          familyMembers: [{ name: 'Spouse', color: '#10b981' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.familyProfileIds).toEqual(['family-profile-1']);
      expect(mockPrisma.householdMember.create).toHaveBeenCalledTimes(2);
    });

    it('migrates existing assets to the new profile', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
        color: '#3b82f6',
        userId: 'user-123',
      });
      mockPrisma.household.create.mockResolvedValue({
        id: 'new-household-id',
        name: "Test User's Household",
      });
      mockPrisma.householdMember.create.mockResolvedValue({});
      mockPrisma.stockAccount.findMany.mockResolvedValue([{ id: 'stock-1' }, { id: 'stock-2' }]);
      mockPrisma.pensionAccount.findMany.mockResolvedValue([{ id: 'pension-1' }]);
      mockPrisma.miscAsset.findMany.mockResolvedValue([{ id: 'asset-1' }]);
      // Mock individual create calls (2 stock + 1 pension + 1 asset = 4 calls)
      mockPrisma.stockAccountOwner.create.mockResolvedValue({});
      mockPrisma.pensionAccountOwner.create.mockResolvedValue({});
      mockPrisma.miscAssetOwner.create.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.migratedAssets).toEqual({
        stockAccounts: 2,
        pensionAccounts: 1,
        miscAssets: 1,
      });
      // Each account gets one individual create call
      expect(mockPrisma.stockAccountOwner.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.pensionAccountOwner.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.miscAssetOwner.create).toHaveBeenCalledTimes(1);
    });

    it('cleans up profile on household creation failure', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      mockPrisma.household.create.mockRejectedValue(new Error('Database error'));
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.details).toContain('create_household');
      expect(mockPrisma.profile.delete).toHaveBeenCalledWith({
        where: { id: 'new-profile-id' },
      });
    });

    it('handles cleanup failure gracefully', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      mockPrisma.household.create.mockRejectedValue(new Error('Database error'));
      mockPrisma.profile.delete.mockRejectedValue(new Error('Cleanup failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('cleans up profile on family member creation failure', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValueOnce({
        id: 'new-profile-id',
        name: 'Test User',
      });
      mockPrisma.household.create.mockResolvedValue({
        id: 'new-household-id',
      });
      mockPrisma.householdMember.create.mockResolvedValueOnce({});
      mockPrisma.profile.create.mockRejectedValueOnce(new Error('Failed to create family profile'));
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          familyMembers: [{ name: 'Spouse', color: '#10b981' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.details).toContain('create_family_members');
    });

    it('handles profile name at max length', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'A'.repeat(100),
      });
      mockPrisma.household.create.mockResolvedValue({
        id: 'new-household-id',
      });
      mockPrisma.householdMember.create.mockResolvedValue({});
      mockPrisma.stockAccount.findMany.mockResolvedValue([]);
      mockPrisma.pensionAccount.findMany.mockResolvedValue([]);
      mockPrisma.miscAsset.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          profileName: 'A'.repeat(100),
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('rejects profile name exceeding max length', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          profileName: 'A'.repeat(101),
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid data');
    });

    it('rejects too many family members (>10)', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      const tooManyMembers = Array.from({ length: 11 }, (_, i) => ({
        name: `Member ${i + 1}`,
        color: '#3b82f6',
      }));

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...validOnboardingData,
          familyMembers: tooManyMembers,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('handles error with cause property correctly', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      const causeError = new Error('Root cause');
      const mainError = new Error('Database error');
      (mainError as Error & { cause: Error }).cause = causeError;
      mockPrisma.household.create.mockRejectedValue(mainError);
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.details).toContain('Root cause');
    });

    it('handles non-Error object thrown', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      mockPrisma.household.create.mockRejectedValue({ code: 'P2002' });
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.details).toContain('P2002');
    });

    it('handles primitive value thrown', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      mockPrisma.household.create.mockRejectedValue('string error');
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.details).toContain('string error');
    });

    it('handles circular object in error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.profile.findUnique.mockResolvedValue(null);
      mockPrisma.profile.create.mockResolvedValue({
        id: 'new-profile-id',
        name: 'Test User',
      });
      const circularObj: { self?: unknown } = {};
      circularObj.self = circularObj;
      mockPrisma.household.create.mockRejectedValue(circularObj);
      mockPrisma.profile.delete.mockResolvedValue({});

      const request = new NextRequest('http://localhost:3001/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(validOnboardingData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      // Should not crash, should return some string representation
      expect(typeof data.details).toBe('string');
    });
  });
});
