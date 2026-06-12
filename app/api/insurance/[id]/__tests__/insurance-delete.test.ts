/**
 * Integration tests for DELETE /api/insurance/[id] route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    insurancePolicy: {
      findFirst: jest.fn(),
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
import { DELETE } from '../route';

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

describe('DELETE /api/insurance/[id]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/insurance/policy-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'policy-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('should return 404 when policy not found', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findFirst as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/insurance/nonexistent', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Policy not found');
  });

  it('should delete policy successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findFirst as jest.Mock).mockResolvedValue({ id: 'policy-1' });
    (mockPrisma.insurancePolicy.delete as jest.Mock).mockResolvedValue({});

    const request = new NextRequest('http://localhost/api/insurance/policy-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'policy-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.insurancePolicy.delete).toHaveBeenCalledWith({ where: { id: 'policy-1' } });
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.insurancePolicy.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost/api/insurance/policy-1', {
      method: 'DELETE',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'policy-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
