/**
 * Integration tests for GET /api/debug/context route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetCategoryGroup: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    household: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

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

describe('GET /api/debug/context', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return failure when no context (unauthenticated)', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain('No context');
  });

  it('should return debug context when authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.budgetCategoryGroup.count as jest.Mock).mockResolvedValue(5);
    (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
      { id: 'household-1', name: 'Test Household' },
    ]);
    (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-1', email: 'test@example.com' },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.context.user.id).toBe('user-1');
    expect(data.debug.categoryGroupsForActiveHousehold).toBe(5);
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.budgetCategoryGroup.count as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
