const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  moneytorRealEstate: { findMany: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { GET } from '../route';

const ctx = { activeHousehold: { id: 'hh-1' } };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/moneytor/real-estate', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns properties + totals + asOf on success', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const syncedA = new Date('2026-07-01T00:00:00Z');
    const syncedB = new Date('2026-07-02T00:00:00Z');
    const purchase = new Date('2020-01-15T00:00:00Z');
    mockPrisma.moneytorRealEstate.findMany.mockResolvedValue([
      {
        id: 're1',
        productId: 'p1',
        name: 'Apartment',
        currentValue: 2_000_000,
        balanceInBase: 1_800_000,
        currency: 'ILS',
        ownership: 100,
        purchasePrice: 1_500_000,
        purchaseDate: purchase,
        purchaseExpenses: 50_000,
        country: 'IL',
        city: 'TLV',
        street: 'Rothschild',
        houseNumber: '5',
        address: 'Rothschild 5, TLV',
        latitude: 32.0,
        longitude: 34.7,
        propertyType: 'apartment',
        propertyCondition: 'good',
        measurementUnit: 'sqm',
        builtArea: 90,
        gardenBalconySize: 8,
        bedrooms: 3,
        floor: 2,
        apartmentFloors: '4',
        rent: 8000,
        rentSuggestion: 9000,
        rentType: 'monthly',
        incomeFrequency: 'monthly',
        saleCommission: 20000,
        profitTax: 10000,
        generalSellingExpenses: 5000,
        legalExpenses: 3000,
        linkedMortgageRef: null,
        customSubtitle: null,
        syncedAt: syncedA,
      },
      {
        // Row exercising all the "null → null" number branches.
        id: 're2',
        productId: 'p2',
        name: 'Land',
        currentValue: 500_000,
        balanceInBase: 500_000,
        currency: 'ILS',
        ownership: null,
        purchasePrice: null,
        purchaseDate: null,
        purchaseExpenses: null,
        country: null,
        city: null,
        street: null,
        houseNumber: null,
        address: null,
        latitude: null,
        longitude: null,
        propertyType: null,
        propertyCondition: null,
        measurementUnit: null,
        builtArea: null,
        gardenBalconySize: null,
        bedrooms: null,
        floor: null,
        apartmentFloors: null,
        rent: null,
        rentSuggestion: null,
        rentType: null,
        incomeFrequency: null,
        saleCommission: null,
        profitTax: null,
        generalSellingExpenses: null,
        legalExpenses: null,
        linkedMortgageRef: null,
        customSubtitle: null,
        syncedAt: syncedB,
      },
    ]);
    const res = await GET();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.properties).toHaveLength(2);
    expect(json.totals.realEstate).toBe(2_300_000);
    // asOf is the max syncedAt across the rows.
    expect(json.asOf).toBe(syncedB.toISOString());
    expect(json.properties[0].purchaseDate).toBe('2020-01-15');
    expect(json.properties[1].ownership).toBeNull();
  });

  it('returns null asOf when there are no rows', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorRealEstate.findMany.mockResolvedValue([]);
    const res = await GET();
    const json = await res.json();
    expect(json.asOf).toBeNull();
    expect(json.totals.realEstate).toBe(0);
  });

  it('500 on DB failure', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorRealEstate.findMany.mockRejectedValue(new Error('boom'));
    const res = await GET();
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
