/**
 * Integration tests for /api/moneytor/accounts route
 */

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorAccount: {
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

// Prisma Decimal values: `Number(decimal)` works when value is a primitive number
const mockBankRow = {
  id: 'acct-1',
  productId: 'prod-1',
  form: 'bank',
  name: 'Checking Account',
  institution: 'Leumi',
  subtype: 'current',
  accountNumber: '1234',
  currency: 'ILS',
  balanceInBase: 10000,
  interestRate: null,
  maturityDate: null,
  monthlyPayment: null,
  customSubtitle: null,
  syncedAt,
  householdId: 'household-1',
};

const mockDebtRow = {
  id: 'acct-2',
  productId: 'prod-2',
  form: 'debt',
  name: 'Car Loan',
  institution: 'Bank',
  subtype: 'loan',
  accountNumber: '5678',
  currency: 'ILS',
  balanceInBase: -5000,
  interestRate: 3.5,
  maturityDate: new Date('2028-01-01'),
  monthlyPayment: 500,
  customSubtitle: 'Toyota Loan',
  syncedAt,
  householdId: 'household-1',
};

describe('GET /api/moneytor/accounts', () => {
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

  it('should return accounts with totals when authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([
      mockBankRow,
      mockDebtRow,
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.accounts).toHaveLength(2);
    expect(data.totals.bank).toBe(10000);
    expect(data.totals.debt).toBe(-5000);
    expect(data.totals.netInScope).toBe(5000);
  });

  it('should return null asOf when no accounts exist', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.asOf).toBeNull();
    expect(data.accounts).toHaveLength(0);
    expect(data.totals).toEqual({ bank: 0, debt: 0, netInScope: 0 });
  });

  it('should map account fields correctly', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([mockDebtRow]);

    const response = await GET();
    const data = await response.json();

    const account = data.accounts[0];
    expect(account.id).toBe('acct-2');
    expect(account.form).toBe('debt');
    expect(account.interestRate).toBe(3.5);
    expect(account.maturityDate).toBe('2028-01-01');
    expect(account.monthlyPayment).toBe(500);
    expect(account.customSubtitle).toBe('Toyota Loan');
  });

  it('should handle null optional fields', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([mockBankRow]);

    const response = await GET();
    const data = await response.json();

    const account = data.accounts[0];
    expect(account.interestRate).toBeNull();
    expect(account.maturityDate).toBeNull();
    expect(account.monthlyPayment).toBeNull();
    expect(account.customSubtitle).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });

  it('maps mortgage tracks from rawData.routesData with all fields present', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const mortgageRow = {
      ...mockDebtRow,
      id: 'acct-3',
      rawData: {
        startDate: '2020-05-01',
        routesData: [
          {
            trackInterestType: { value: 'fixed' },
            interest: '3.25',
            remainder: 250000,
            monthlyRepayment: '1200',
          },
        ],
      },
    };
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([mortgageRow]);

    const response = await GET();
    const data = await response.json();

    const account = data.accounts[0];
    expect(account.startDate).toBe('2020-05-01');
    expect(account.tracks).toHaveLength(1);
    expect(account.tracks[0]).toEqual({
      interestType: 'fixed',
      interest: 3.25,
      remainder: 250000,
      monthlyRepayment: 1200,
    });
  });

  it('coerces missing track subfields to null', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const mortgageRow = {
      ...mockDebtRow,
      id: 'acct-4',
      rawData: {
        routesData: [
          {
            // no trackInterestType, no interest, no remainder, no monthlyRepayment
          },
        ],
      },
    };
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([mortgageRow]);

    const response = await GET();
    const data = await response.json();

    const account = data.accounts[0];
    expect(account.tracks[0]).toEqual({
      interestType: null,
      interest: null,
      remainder: null,
      monthlyRepayment: null,
    });
    // startDate absent from rawData -> null
    expect(account.startDate).toBeNull();
  });

  it('leaves tracks undefined when routesData is empty or not an array', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const emptyRoutes = {
      ...mockDebtRow,
      id: 'acct-5',
      rawData: { startDate: '2021-01-01', routesData: [] },
    };
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([emptyRoutes]);

    const response = await GET();
    const data = await response.json();

    expect(data.accounts[0].tracks).toBeUndefined();
    expect(data.accounts[0].startDate).toBe('2021-01-01');
  });

  it('picks the latest syncedAt as asOf across rows', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const later = new Date('2026-07-01T08:00:00.000Z');
    const laterRow = { ...mockBankRow, id: 'acct-6', syncedAt: later };
    (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValue([mockBankRow, laterRow]);

    const response = await GET();
    const data = await response.json();

    expect(data.asOf).toBe(later.toISOString());
  });
});
