/**
 * Integration tests for /api/shopping/cart/deliver route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    shoppingCartItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingItem: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    shoppingDelivery: {
      create: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';

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

describe('POST /api/shopping/cart/deliver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should deliver cart with no items successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    // No cart items
    (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([]);
    // No default items
    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.shoppingDelivery.create as jest.Mock).mockResolvedValue({ id: 'delivery-1' });

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.delivered).toBe(0);
    expect(data.data.keptForNext).toBe(0);
    expect(data.data.defaultsAdded).toBe(0);
  });

  it('should deliver checked items and re-add default items', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const checkedItem = {
      id: 'cart-1',
      itemId: 'item-1',
      householdId: 'household-1',
      checked: true,
      quantity: 1,
      item: { id: 'item-1', name: 'Milk', isDefault: false },
    };

    (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([checkedItem]);
    (mockPrisma.shoppingItem.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.shoppingCartItem.delete as jest.Mock).mockResolvedValue({});

    const defaultItem = { id: 'item-default-1', name: 'Bread', isDefault: true };
    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([defaultItem]);
    (mockPrisma.shoppingCartItem.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.shoppingDelivery.create as jest.Mock).mockResolvedValue({ id: 'delivery-1' });

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.delivered).toBe(1);
    expect(data.data.defaultsAdded).toBe(1);
  });

  it('should keep missing items in cart unchecked', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const checkedMissingItem = {
      id: 'cart-2',
      itemId: 'item-2',
      householdId: 'household-1',
      checked: true,
      quantity: 1,
      item: { id: 'item-2', name: 'Eggs', isDefault: false },
    };

    (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValue([checkedMissingItem]);
    (mockPrisma.shoppingCartItem.update as jest.Mock).mockResolvedValue({
      ...checkedMissingItem,
      checked: false,
    });
    (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.shoppingDelivery.create as jest.Mock).mockResolvedValue({ id: 'delivery-1' });

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({ missingItemIds: ['item-2'] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.delivered).toBe(0);
    expect(data.data.keptForNext).toBe(1);

    // The missing item should have been unchecked via update
    expect(mockPrisma.shoppingCartItem.update).toHaveBeenCalledWith({
      where: { id: 'cart-2' },
      data: { checked: false },
    });
  });

  it('should return 400 for invalid request body', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({ missingItemIds: 'not-an-array' }), // Invalid: should be array
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should handle server errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const request = new NextRequest('http://localhost/api/shopping/cart/deliver', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to deliver cart');
  });
});
