import { computeNetWorthBreakdown } from '../net-worth-breakdown';

const NO_MONEYTOR = { pension: 0, hishtalmut: 0, bank: 0, debts: 0, realEstate: 0 };

describe('computeNetWorthBreakdown', () => {
  it('folds cash/savings (Moneytor bank + misc deposits) into the portfolio bucket', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 100000, // stocks
      manualPension: [],
      manualMisc: [
        { type: 'bank_deposit', currentValue: 20000 },
        { type: 'child_savings', currentValue: 5000 },
      ],
      moneytor: { ...NO_MONEYTOR, bank: 30000 },
    });
    // 100k stocks + 30k Moneytor bank + 25k misc savings
    expect(b.portfolio).toBe(155000);
    expect(b.otherAssets).toBe(0);
  });

  it('splits pension vs hishtalmut across manual and Moneytor sources', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 0,
      manualPension: [
        { type: 'pension', currentValue: 200000 },
        { type: 'hishtalmut', currentValue: 60000 },
      ],
      manualMisc: [],
      moneytor: { ...NO_MONEYTOR, pension: 340000, hishtalmut: 90000 },
    });
    // pension bucket = manual pension (200k) + Moneytor retirement (340k − 90k)
    expect(b.pension).toBe(200000 + 250000);
    // hishtalmut bucket = manual hishtalmut (60k) + Moneytor hishtalmut (90k)
    expect(b.hishtalmut).toBe(60000 + 90000);
  });

  it('sums debts (manual negatives + Moneytor) as a positive magnitude', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 0,
      manualPension: [],
      manualMisc: [
        { type: 'loan', currentValue: -15000 },
        { type: 'mortgage', currentValue: -900000 },
      ],
      moneytor: { ...NO_MONEYTOR, debts: 4000 },
    });
    expect(b.debts).toBe(15000 + 900000 + 4000);
  });

  it('classifies non-savings positive misc as otherAssets', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 0,
      manualPension: [],
      // A positive loan (unusual, but must not be lost) is a catch-all asset.
      manualMisc: [{ type: 'loan', currentValue: 7000 }],
      moneytor: NO_MONEYTOR,
    });
    expect(b.otherAssets).toBe(7000);
    expect(b.portfolio).toBe(0);
    expect(b.debts).toBe(0);
  });

  it('reconciles: netWorth === portfolio + pension + hishtalmut + realEstate + otherAssets − debts', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 120000,
      manualPension: [
        { type: 'pension', currentValue: 300000 },
        { type: 'hishtalmut', currentValue: 45000 },
      ],
      manualMisc: [
        { type: 'bank_deposit', currentValue: 25000 },
        { type: 'child_savings', currentValue: 8000 },
        { type: 'mortgage', currentValue: -750000 },
      ],
      moneytor: {
        pension: 500000,
        hishtalmut: 120000,
        bank: 60000,
        debts: 12000,
        realEstate: 1800000,
      },
    });

    const recomputed =
      b.portfolio + b.pension + b.hishtalmut + b.realEstate + b.otherAssets - b.debts;
    expect(b.netWorth).toBeCloseTo(recomputed, 6);

    // And it equals the plain net-worth sum computed the "old" way:
    // stocks + all-pension + (all assets − all debts)
    const stocks = 120000;
    const allPension = 300000 + 45000 + 500000; // manual both types + Moneytor all
    const positiveAssets = 25000 + 8000 + 60000 + 1800000; // savings + bank + real estate
    const allDebts = 750000 + 12000;
    const oldWay = stocks + allPension + (positiveAssets - allDebts);
    expect(b.netWorth).toBeCloseTo(oldWay, 6);
  });

  it('is all-zero for an empty portfolio', () => {
    const b = computeNetWorthBreakdown({
      portfolioValue: 0,
      manualPension: [],
      manualMisc: [],
      moneytor: NO_MONEYTOR,
    });
    expect(b).toEqual({
      portfolio: 0,
      pension: 0,
      hishtalmut: 0,
      realEstate: 0,
      otherAssets: 0,
      debts: 0,
      netWorth: 0,
    });
  });
});
