/**
 * Integration tests for GET /api/moneytor/pension/history route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorPensionSnapshot: {
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

describe('GET /api/moneytor/pension/history', () => {
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

  it('should return empty history when no snapshots', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.history).toHaveLength(0);
  });

  it('should aggregate pension and hishtalmut funds by month', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'snap-1',
        snapshotMonth: new Date('2026-06-01'),
        productType: 'פנסיה',
        balanceInBase: 300000,
        householdId: 'household-1',
      },
      {
        id: 'snap-2',
        snapshotMonth: new Date('2026-06-01'),
        productType: 'השתלמות',
        balanceInBase: 50000,
        householdId: 'household-1',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].pension).toBe(300000);
    expect(data.history[0].hishtalmut).toBe(50000);
    expect(data.history[0].total).toBe(350000);
  });

  it('should return multiple months in chronological order', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'snap-1',
        snapshotMonth: new Date('2026-03-01'),
        productType: 'פנסיה',
        balanceInBase: 280000,
        householdId: 'household-1',
      },
      {
        id: 'snap-2',
        snapshotMonth: new Date('2026-06-01'),
        productType: 'פנסיה',
        balanceInBase: 300000,
        householdId: 'household-1',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.history).toHaveLength(2);
    expect(data.history[0].month).toBe('2026-03-01');
    expect(data.history[1].month).toBe('2026-06-01');
  });

  it('should handle unknown product types (neither pension nor hishtalmut)', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'snap-1',
        snapshotMonth: new Date('2026-06-01'),
        productType: 'קופת גמל',
        balanceInBase: 100000,
        householdId: 'household-1',
      },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.history[0].pension).toBe(0);
    expect(data.history[0].hishtalmut).toBe(0);
    expect(data.history[0].total).toBe(100000);
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockRejectedValue(
      new Error('DB error')
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
