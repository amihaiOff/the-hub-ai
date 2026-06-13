/**
 * Integration tests for /api/moneytor/pension route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorPensionFund: {
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

const syncedAt = new Date('2026-06-12T10:00:00.000Z');

const makePensionFundRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'fund-1',
  productId: 'prod-1',
  routeName: 'pension',
  routeCode: 'P1',
  name: 'My Pension',
  institution: 'Clal',
  productType: 'פנסיה',
  sugKupa: null,
  accountNumber: '9999',
  accountOwner: 'Alice',
  fundId: 'F123',
  fundOpeningDate: new Date('2010-01-01'),
  amount: 300000,
  currency: 'ILS',
  balanceInBase: 300000,
  profitsFromLastYear: 15000,
  monthlyDepositEmployee: 1000,
  monthlyDepositEmployer: 1500,
  monthlyDepositSum: 2500,
  depositFrequency: 'monthly',
  employerProvisionPct: 8.33,
  compensationProvisionPct: 8.33,
  mgmtFeeFromSavings: 0.1,
  mgmtFeeFromDeposit: 0.5,
  projectedMonthlyPension: 5000,
  projectedSavingsWithPremiums: 800000,
  projectedSavingsWithoutPremiums: 600000,
  yearsToRetirement: 20,
  gilPrisha: null,
  sumHafkadotPitsuyim: null,
  sumHafkadotLoPitsuyim: null,
  syncedAt,
  householdId: 'household-1',
  ...overrides,
});

describe('GET /api/moneytor/pension', () => {
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

  it('should return pension funds with totals', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValue([
      makePensionFundRow(),
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.funds).toHaveLength(1);
    expect(data.totals.pension).toBe(300000);
    expect(data.totals.hishtalmut).toBe(0);
    expect(data.totals.total).toBe(300000);
  });

  it('should correctly categorize hishtalmut funds', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValue([
      makePensionFundRow({ productType: 'השתלמות', balanceInBase: 50000 }),
    ]);

    const response = await GET();
    const data = await response.json();

    expect(data.totals.pension).toBe(0);
    expect(data.totals.hishtalmut).toBe(50000);
    expect(data.totals.total).toBe(50000);
  });

  it('should return null asOf when no funds', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.asOf).toBeNull();
    expect(data.funds).toHaveLength(0);
    expect(data.totals).toEqual({ pension: 0, hishtalmut: 0, total: 0 });
  });

  it('should map fund fields correctly including null optional fields', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValue([
      makePensionFundRow({
        fundOpeningDate: null,
        profitsFromLastYear: null,
        monthlyDepositEmployee: null,
        monthlyDepositEmployer: null,
      }),
    ]);

    const response = await GET();
    const data = await response.json();

    const fund = data.funds[0];
    expect(fund.fundOpeningDate).toBeNull();
    expect(fund.profitsFromLastYear).toBeNull();
    expect(fund.monthlyDepositEmployee).toBeNull();
    expect(fund.monthlyDepositEmployer).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
