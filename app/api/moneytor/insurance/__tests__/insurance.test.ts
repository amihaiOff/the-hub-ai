/**
 * Integration tests for /api/moneytor/insurance route
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorInsurancePolicy: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockFindMany = prisma.moneytorInsurancePolicy.findMany as jest.Mock;

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

const syncedAt = new Date('2026-10-22T10:00:00.000Z');

const makeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'row-1',
  policyKey: 'pol-1',
  policyNumber: '12345',
  title: 'Health',
  company: 'Harel',
  companyShort: 'HRL',
  categoryKey: 'health',
  categoryLabelHeb: 'בריאות',
  categoryLabelEng: 'Health',
  status: 'active',
  // Prisma returns Decimal for money columns.
  monthlyPremium: new Prisma.Decimal('100.10'),
  annualPremium: new Prisma.Decimal('1201.20'),
  renewalPeriod: null,
  personId: 'p-1',
  insuredName: 'Alice',
  coverages: [],
  rawData: {},
  householdId: 'household-1',
  syncedAt,
  sourceUpdatedAt: new Date('2026-08-19T15:59:00.000Z'),
  createdAt: syncedAt,
  ...overrides,
});

describe('GET /api/moneytor/insurance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ ok: false, error: 'Unauthorized' });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('maps rows to numbers and computes totals scoped to the active household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockFindMany.mockResolvedValue([
      makeRow(),
      makeRow({
        id: 'row-2',
        policyKey: 'pol-2',
        monthlyPremium: new Prisma.Decimal('0.20'),
        annualPremium: new Prisma.Decimal('2.40'),
      }),
      makeRow({
        id: 'row-3',
        policyKey: 'pol-3',
        company: 'Migdal',
        monthlyPremium: new Prisma.Decimal('0'),
        annualPremium: new Prisma.Decimal('0'),
      }),
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: 'household-1' } })
    );
    expect(data.ok).toBe(true);
    expect(data.asOf).toBe('2026-08-19T15:59:00.000Z'); // Moneytor's stamp, not syncedAt
    expect(data.policies).toHaveLength(3);
    expect(data.policies[0]).toMatchObject({
      id: 'row-1',
      policyNumber: '12345',
      monthlyPremium: 100.1,
      annualPremium: 1201.2,
      insuredName: 'Alice',
    });
    // rawData / householdId are not exposed
    expect(data.policies[0].rawData).toBeUndefined();
    expect(data.policies[0].householdId).toBeUndefined();
    // 100.10 + 0.20 would be 100.30000000000001 without rounding
    expect(data.totals).toEqual({ monthly: 100.3, annual: 1203.6, policies: 3, companies: 2 });
  });

  it('returns empty totals and null asOf when there are no policies', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockFindMany.mockResolvedValue([]);

    const data = await (await GET()).json();

    expect(data.asOf).toBeNull();
    expect(data.totals).toEqual({ monthly: 0, annual: 0, policies: 0, companies: 0 });
  });

  it('returns 500 when the query fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockFindMany.mockRejectedValue(new Error('db down'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
    errSpy.mockRestore();
  });
});
