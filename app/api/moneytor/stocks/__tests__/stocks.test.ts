/**
 * Integration tests for GET /api/moneytor/stocks route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorStockHolding: {
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

describe('GET /api/moneytor/stocks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it('should return empty accounts when no holdings', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.accounts).toHaveLength(0);
  });

  it('should group holdings by productId', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'h-1',
        productId: 'prod-1',
        accountName: 'IBI Trading',
        broker: 'IBI',
        accountCash: 2000,
        stockName: 'AAPL',
        amount: 10,
        purchasePrice: 150,
        purchaseDate: new Date('2025-01-15'),
        stockPrice: 200,
        currency: 'USD',
        totalWorthInBase: 20000,
        householdId: 'household-1',
      },
      {
        id: 'h-2',
        productId: 'prod-1',
        accountName: 'IBI Trading',
        broker: 'IBI',
        accountCash: 2000,
        stockName: 'GOOGL',
        amount: 5,
        purchasePrice: null,
        purchaseDate: null,
        stockPrice: 180,
        currency: 'USD',
        totalWorthInBase: 9000,
        householdId: 'household-1',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].productId).toBe('prod-1');
    expect(data.accounts[0].holdings).toHaveLength(2);
    expect(data.accounts[0].totalValue).toBe(29000);
    expect(data.accounts[0].cash).toBe(2000);
  });

  it('should handle null purchasePrice and purchaseDate', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'h-1',
        productId: 'prod-1',
        accountName: 'Trading',
        broker: null,
        accountCash: null,
        stockName: 'TSLA',
        amount: 5,
        purchasePrice: null,
        purchaseDate: null,
        stockPrice: 300,
        currency: 'USD',
        totalWorthInBase: 15000,
        householdId: 'household-1',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.accounts[0].holdings[0].purchasePrice).toBeNull();
    expect(data.accounts[0].holdings[0].purchaseDate).toBeNull();
    expect(data.accounts[0].cash).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockRejectedValue(
      new Error('DB error')
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
