/**
 * Integration tests for /api/insurance route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    insurancePolicy: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    householdMember: {
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

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

const mockPolicy = {
  id: 'policy-1',
  profileId: 'profile-1',
  householdId: 'household-1',
  mainBranch: 'Life',
  subBranch: 'Term',
  productType: 'life_insurance',
  company: 'Harel',
  insurancePeriod: '2025-2030',
  additionalDetails: null,
  premiumIls: 250,
  premiumType: 'monthly',
  policyNumber: 'L-12345',
  planClassification: 'standard',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  profile: {
    id: 'profile-1',
    name: 'Alice',
    color: '#3B82F6',
    image: null,
  },
};

describe('GET /api/insurance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('should return empty grouped data when no policies', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({});
  });

  it('should return policies grouped by profileId', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValue([mockPolicy]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data['profile-1']).toBeDefined();
    expect(data.data['profile-1'].policies).toHaveLength(1);
    expect(data.data['profile-1'].profile.name).toBe('Alice');
  });

  it('should convert premiumIls Decimal to number', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValue([mockPolicy]);

    const response = await GET();
    const data = await response.json();

    expect(typeof data.data['profile-1'].policies[0].premiumIls).toBe('number');
    expect(data.data['profile-1'].policies[0].premiumIls).toBe(250);
  });

  it('should handle null premiumIls', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValue([
      { ...mockPolicy, premiumIls: null },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.data['profile-1'].policies[0].premiumIls).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});

describe('POST /api/insurance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/insurance', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'profile-1', mainBranch: 'Life' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('should return 400 for invalid body', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const request = new NextRequest('http://localhost/api/insurance', {
      method: 'POST',
      body: JSON.stringify({ profileId: '', mainBranch: 'Life' }), // empty profileId
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should return 400 when profile not in household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/insurance', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'other-profile', mainBranch: 'Life' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Profile not found in household');
  });

  it('should create policy successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValue({ id: 'member-1' });
    (mockPrisma.insurancePolicy.create as jest.Mock).mockResolvedValue(mockPolicy);

    const request = new NextRequest('http://localhost/api/insurance', {
      method: 'POST',
      body: JSON.stringify({
        profileId: 'profile-1',
        mainBranch: 'Life',
        company: 'Harel',
        premiumIls: 250,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('policy-1');
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValue({ id: 'member-1' });
    (mockPrisma.insurancePolicy.create as jest.Mock).mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost/api/insurance', {
      method: 'POST',
      body: JSON.stringify({ profileId: 'profile-1', mainBranch: 'Life' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
