/**
 * Integration tests for /api/shopping/items/warnings route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingItem: {
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

describe('GET /api/shopping/items/warnings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return empty list when no items exceed warning threshold', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3); // purchased 3 days ago

    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'item-1',
        name: 'Milk',
        nameHe: 'חלב',
        categoryId: 'cat-1',
        warningDays: 7,
        lastPurchasedAt: recentDate, // Only 3 days ago, threshold is 7
        category: { id: 'cat-1', name: 'Dairy' },
        cartItems: [],
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
  });

  it('should return warnings when items exceed threshold', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10); // purchased 10 days ago

    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'item-1',
        name: 'Milk',
        nameHe: 'חלב',
        categoryId: 'cat-1',
        warningDays: 7,
        lastPurchasedAt: oldDate, // 10 days ago, threshold is 7 => warning
        category: { id: 'cat-1', name: 'Dairy' },
        cartItems: [],
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].name).toBe('Milk');
    expect(data.data[0].nameHe).toBe('חלב');
    expect(data.data[0].categoryName).toBe('Dairy');
    expect(data.data[0].warningDays).toBe(7);
    expect(data.data[0].daysSinceLastPurchase).toBeGreaterThanOrEqual(7);
  });

  it('should indicate when a warning item is already in cart', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 14);

    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'item-1',
        name: 'Eggs',
        nameHe: null,
        categoryId: 'cat-1',
        warningDays: 7,
        lastPurchasedAt: oldDate,
        category: { id: 'cat-1', name: 'Produce' },
        cartItems: [{ id: 'cart-1' }], // already in cart
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data[0].inCart).toBe(true);
  });

  it('should return empty list when no items have warning days set', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(0);
  });

  it('should handle server errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    (mockPrisma.shoppingItem.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch shopping warnings');
  });
});
