jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorStockHolding: { findMany: jest.fn() },
    moneytorPensionFund: { findMany: jest.fn() },
    moneytorAccount: { findMany: jest.fn() },
    moneytorRealEstate: { findMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { getMoneytorNetWorthTotals, isMoneytorHishtalmut } from '../moneytor-net-worth';

const mockStock = prisma.moneytorStockHolding.findMany as jest.Mock;
const mockPension = prisma.moneytorPensionFund.findMany as jest.Mock;
const mockAccounts = prisma.moneytorAccount.findMany as jest.Mock;
const mockRealEstate = prisma.moneytorRealEstate.findMany as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isMoneytorHishtalmut', () => {
  it('uses sugKupa === 3 when present', () => {
    expect(isMoneytorHishtalmut({ sugKupa: 3, productType: 'anything' })).toBe(true);
    expect(isMoneytorHishtalmut({ sugKupa: 1, productType: 'קרן השתלמות' })).toBe(false);
  });

  it('falls back to the Hebrew productType when sugKupa is absent', () => {
    expect(isMoneytorHishtalmut({ sugKupa: null, productType: 'קרן השתלמות' })).toBe(true);
    expect(isMoneytorHishtalmut({ sugKupa: null, productType: 'קרן פנסיה' })).toBe(false);
  });
});

describe('getMoneytorNetWorthTotals', () => {
  it('returns zeros when householdId is null (no DB calls made)', async () => {
    const totals = await getMoneytorNetWorthTotals(null);
    expect(totals).toEqual({
      portfolio: 0,
      pension: 0,
      hishtalmut: 0,
      assetsNet: 0,
      assetsPositive: 0,
      assetsNegative: 0,
      bank: 0,
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

  it('sums balances, splits positive/negative accounts, and separates bank from real estate', async () => {
    mockStock.mockResolvedValue([{ totalWorthInBase: 1000 }, { totalWorthInBase: 500 }]);
    // One pension (sugKupa 1), one hishtalmut (sugKupa 3).
    mockPension.mockResolvedValue([
      { balanceInBase: 250000, sugKupa: 1, productType: 'קרן פנסיה' },
      { balanceInBase: 90000, sugKupa: 3, productType: 'קרן השתלמות' },
    ]);
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
    expect(totals.pension).toBe(340000); // pension + hishtalmut together
    expect(totals.hishtalmut).toBe(90000);
    expect(totals.realEstate).toBe(2300000);
    // Bank = positive account balances only (no real estate).
    expect(totals.bank).toBe(40000 + 12000);
    // Positive accounts + real estate rolled in
    expect(totals.assetsPositive).toBe(40000 + 12000 + 2300000);
    // Negative accounts flipped to absolute values
    expect(totals.assetsNegative).toBe(3000 + 500000);
    expect(totals.assetsNet).toBe(totals.assetsPositive - totals.assetsNegative);
    expect(totals.portfolioHoldingsCount).toBe(2);
    expect(totals.pensionFundsCount).toBe(2);
    expect(totals.accountsCount).toBe(4);
    expect(totals.realEstateCount).toBe(2);
  });

  it('treats a zero-balance account as positive (>= 0 branch)', async () => {
    mockStock.mockResolvedValue([]);
    mockPension.mockResolvedValue([]);
    mockAccounts.mockResolvedValue([{ balanceInBase: 0 }]);
    mockRealEstate.mockResolvedValue([]);

    const totals = await getMoneytorNetWorthTotals('hh-1');
    expect(totals.bank).toBe(0);
    expect(totals.assetsPositive).toBe(0);
    expect(totals.assetsNegative).toBe(0);
    expect(totals.assetsNet).toBe(0);
    expect(totals.accountsCount).toBe(1);
  });
});
