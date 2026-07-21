import { prisma } from '@/lib/db';

export interface MoneytorNetWorthTotals {
  /** Sum of `totalWorthInBase` across all Moneytor stock holdings (already in ILS). */
  portfolio: number;
  /** Sum of `balanceInBase` across ALL Moneytor pension funds — pension AND
   *  hishtalmut together (already in ILS). `hishtalmut` below is a subset. */
  pension: number;
  /**
   * Subset of `pension`: sum of `balanceInBase` for hishtalmut (study-fund)
   * rows only. A fund is hishtalmut when `sugKupa === 3` (Moneytor's code), or
   * — when `sugKupa` is absent — when its Hebrew `productType` says so. The
   * retirement-only figure is `pension - hishtalmut`.
   */
  hishtalmut: number;
  /**
   * Net of `balanceInBase` across all Moneytor accounts. Balances are signed at
   * the source (banks positive, debts negative), so a plain sum gives the net
   * contribution to net worth. Splits the positive/negative parts for callers
   * that need to display them separately.
   */
  assetsNet: number;
  assetsPositive: number;
  assetsNegative: number;
  /**
   * Positive bank/account balances only (savings, current accounts, deposits) —
   * i.e. `assetsPositive` before real estate is folded in. Kept separate so a
   * breakdown can attribute cash/savings without double-counting real estate.
   */
  bank: number;
  /** Sum of `balanceInBase` across all Moneytor real-estate properties. */
  realEstate: number;
  /** Counts so dashboard pills can show "X+Y accounts" rather than just X. */
  portfolioHoldingsCount: number;
  pensionFundsCount: number;
  accountsCount: number;
  realEstateCount: number;
}

const EMPTY: MoneytorNetWorthTotals = {
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
};

/**
 * A Moneytor pension fund is a hishtalmut (study fund) when its `sugKupa`
 * code is 3. Older/edge rows may lack `sugKupa`; fall back to the Hebrew
 * `productType` label ("קרן השתלמות") in that case. Everything else counts
 * as retirement pension.
 */
export function isMoneytorHishtalmut(fund: {
  sugKupa: number | null;
  productType: string;
}): boolean {
  if (fund.sugKupa != null) return fund.sugKupa === 3;
  return fund.productType.includes('השתלמות');
}

/**
 * Sum Moneytor-sourced balances for a household. Returns zeros for the
 * legacy "user without household" case (caller passes null) so the rest of
 * the net-worth math doesn't need to special-case it.
 */
export async function getMoneytorNetWorthTotals(
  householdId: string | null
): Promise<MoneytorNetWorthTotals> {
  if (!householdId) return EMPTY;

  const [stockHoldings, pensionFunds, accounts, realEstateRows] = await Promise.all([
    prisma.moneytorStockHolding.findMany({
      where: { householdId },
      select: { totalWorthInBase: true },
    }),
    prisma.moneytorPensionFund.findMany({
      where: { householdId },
      select: { balanceInBase: true, sugKupa: true, productType: true },
    }),
    prisma.moneytorAccount.findMany({
      where: { householdId },
      select: { balanceInBase: true },
    }),
    prisma.moneytorRealEstate.findMany({
      where: { householdId },
      select: { balanceInBase: true },
    }),
  ]);

  const portfolio = stockHoldings.reduce((sum, h) => sum + Number(h.totalWorthInBase), 0);
  const pension = pensionFunds.reduce((sum, f) => sum + Number(f.balanceInBase), 0);
  const hishtalmut = pensionFunds
    .filter(isMoneytorHishtalmut)
    .reduce((sum, f) => sum + Number(f.balanceInBase), 0);
  const realEstate = realEstateRows.reduce((sum, r) => sum + Number(r.balanceInBase), 0);

  // `bank` is the positive account balances alone (savings/current/deposits),
  // captured before real estate is folded into `assetsPositive` below.
  let bank = 0;
  let assetsNegative = 0;
  for (const a of accounts) {
    const v = Number(a.balanceInBase);
    if (v >= 0) bank += v;
    else assetsNegative += Math.abs(v);
  }
  // Real estate counts as a positive asset alongside bank balances. Keep
  // `realEstate` exposed separately so UIs can break it out, but also fold
  // it into the asset totals so net-worth math doesn't silently miss it.
  const assetsPositive = bank + realEstate;

  return {
    portfolio,
    pension,
    hishtalmut,
    assetsNet: assetsPositive - assetsNegative,
    assetsPositive,
    assetsNegative,
    bank,
    realEstate,
    portfolioHoldingsCount: stockHoldings.length,
    pensionFundsCount: pensionFunds.length,
    accountsCount: accounts.length,
    realEstateCount: realEstateRows.length,
  };
}
