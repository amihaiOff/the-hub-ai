/**
 * Integration tests for GET /api/moneytor/portfolio route
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

const mockHoldingRow = {
  id: 'holding-1',
  productId: 'prod-1',
  accountName: 'IBI Trading',
  broker: 'IBI',
  stockName: 'AAPL',
  amount: 10,
  purchasePrice: 150,
  stockPrice: 200,
  totalWorthInBase: 20000, // In ILS
  accountCash: 2000,
  householdId: 'household-1',
};

describe('GET /api/moneytor/portfolio', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return empty portfolio when no holdings', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.totalValue).toBe(0);
    expect(data.totalHoldings).toBe(0);
    expect(data.accounts).toHaveLength(0);
  });

  it('should calculate portfolio totals correctly', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([mockHoldingRow]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.totalHoldingsValue).toBe(20000);
    expect(data.totalCash).toBe(2000);
    expect(data.totalValue).toBe(22000); // 20000 + 2000
    expect(data.totalHoldings).toBe(1);
    expect(data.accounts).toHaveLength(1);
  });

  it('should group multiple holdings under same account', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([
      {
        ...mockHoldingRow,
        id: 'h-1',
        stockName: 'AAPL',
        totalWorthInBase: 20000,
        accountCash: 2000,
      },
      {
        ...mockHoldingRow,
        id: 'h-2',
        stockName: 'GOOGL',
        totalWorthInBase: 15000,
        purchasePrice: 100,
        stockPrice: 150,
        accountCash: null,
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.accounts).toHaveLength(1); // Same productId → same account
    expect(data.accounts[0].holdings).toHaveLength(2);
    expect(data.totalHoldingsValue).toBe(35000);
    expect(data.totalCash).toBe(2000); // Only counted once from first holding
  });

  it('should handle zero purchasePrice (no gain/loss calculation)', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([
      { ...mockHoldingRow, purchasePrice: 0, totalWorthInBase: 10000, accountCash: null },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // When purchasePrice=0, gainLossPercent should be 0
    expect(data.accounts[0].holdings[0].gainLossPercent).toBe(0);
  });

  it('should handle holding with no cash in account', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValue([
      { ...mockHoldingRow, accountCash: null },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.accounts[0].totalCash).toBe(0);
    expect(data.accounts[0].cashBalances).toHaveLength(0);
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
