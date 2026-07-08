jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorStockHolding: { findMany: jest.fn() },
    moneytorPensionFund: { findMany: jest.fn() },
    moneytorAccount: { findMany: jest.fn() },
    moneytorRealEstate: { findMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { getMoneytorNetWorthTotals } from '../moneytor-net-worth';

const mockStock = prisma.moneytorStockHolding.findMany as jest.Mock;
const mockPension = prisma.moneytorPensionFund.findMany as jest.Mock;
const mockAccounts = prisma.moneytorAccount.findMany as jest.Mock;
const mockRealEstate = prisma.moneytorRealEstate.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMoneytorNetWorthTotals', () => {
  it('returns zeros when householdId is null (no DB calls made)', async () => {
    const totals = await getMoneytorNetWorthTotals(null);
    expect(totals).toEqual({
      portfolio: 0,
      pension: 0,
      assetsNet: 0,
      assetsPositive: 0,
      assetsNegative: 0,
      realEstate: 0,
      portfolioHoldingsCount: 0,
      pensionFundsCount: 0,
      accountsCount: 0,
      realEstateCount: 0,
    });
    expect(mockStock).not.toHaveBeenCalled();
    expect(mockPension).not.toHaveBeenCalled();
    expect(mockAccounts).not.toHaveBeenCalled();
    expect(mockRealEstate).not.toHaveBeenCalled();
  });

  it('sums balances and splits positive vs negative accounts', async () => {
    mockStock.mockResolvedValue([{ totalWorthInBase: 1000 }, { totalWorthInBase: 500 }]);
    mockPension.mockResolvedValue([{ balanceInBase: 250000 }]);
    // Two positive (checking / savings), two negative (credit card / mortgage).
    mockAccounts.mockResolvedValue([
      { balanceInBase: 40000 },
      { balanceInBase: 12000 },
      { balanceInBase: -3000 },
      { balanceInBase: -500000 },
    ]);
    mockRealEstate.mockResolvedValue([{ balanceInBase: 1500000 }, { balanceInBase: 800000 }]);

    const totals = await getMoneytorNetWorthTotals('hh-1');

    expect(totals.portfolio).toBe(1500);
    expect(totals.pension).toBe(250000);
    expect(totals.realEstate).toBe(2300000);
    // Positive accounts + real estate rolled in
    expect(totals.assetsPositive).toBe(40000 + 12000 + 2300000);
    // Negative accounts flipped to absolute values
    expect(totals.assetsNegative).toBe(3000 + 500000);
    expect(totals.assetsNet).toBe(totals.assetsPositive - totals.assetsNegative);
    expect(totals.portfolioHoldingsCount).toBe(2);
    expect(totals.pensionFundsCount).toBe(1);
    expect(totals.accountsCount).toBe(4);
    expect(totals.realEstateCount).toBe(2);
  });

  it('treats a zero-balance account as positive (>= 0 branch)', async () => {
    mockStock.mockResolvedValue([]);
    mockPension.mockResolvedValue([]);
    mockAccounts.mockResolvedValue([{ balanceInBase: 0 }]);
    mockRealEstate.mockResolvedValue([]);

    const totals = await getMoneytorNetWorthTotals('hh-1');
    expect(totals.assetsPositive).toBe(0);
    expect(totals.assetsNegative).toBe(0);
    expect(totals.assetsNet).toBe(0);
    expect(totals.accountsCount).toBe(1);
  });
});
