import { prisma } from '@/lib/db';

export interface MoneytorNetWorthTotals {
  /** Sum of `totalWorthInBase` across all Moneytor stock holdings (already in ILS). */
  portfolio: number;
  /** Sum of `balanceInBase` across all Moneytor pension funds (already in ILS). */
  pension: number;
  /**
   * Net of `balanceInBase` across all Moneytor accounts. Balances are signed at
   * the source (banks positive, debts negative), so a plain sum gives the net
   * contribution to net worth. Splits the positive/negative parts for callers
   * that need to display them separately.
   */
  assetsNet: number;
  assetsPositive: number;
  assetsNegative: number;
  /** Counts so dashboard pills can show "X+Y accounts" rather than just X. */
  portfolioHoldingsCount: number;
  pensionFundsCount: number;
  accountsCount: number;
}

const EMPTY: MoneytorNetWorthTotals = {
  portfolio: 0,
  pension: 0,
  assetsNet: 0,
  assetsPositive: 0,
  assetsNegative: 0,
  portfolioHoldingsCount: 0,
  pensionFundsCount: 0,
  accountsCount: 0,
};

/**
 * Sum Moneytor-sourced balances for a household. Returns zeros for the
 * legacy "user without household" case (caller passes null) so the rest of
 * the net-worth math doesn't need to special-case it.
 */
export async function getMoneytorNetWorthTotals(
  householdId: string | null
): Promise<MoneytorNetWorthTotals> {
  if (!householdId) return EMPTY;

  const [stockHoldings, pensionFunds, accounts] = await Promise.all([
    prisma.moneytorStockHolding.findMany({
      where: { householdId },
      select: { totalWorthInBase: true },
    }),
    prisma.moneytorPensionFund.findMany({
      where: { householdId },
      select: { balanceInBase: true },
    }),
    prisma.moneytorAccount.findMany({
      where: { householdId },
      select: { balanceInBase: true },
    }),
  ]);

  const portfolio = stockHoldings.reduce((sum, h) => sum + Number(h.totalWorthInBase), 0);
  const pension = pensionFunds.reduce((sum, f) => sum + Number(f.balanceInBase), 0);

  let assetsPositive = 0;
  let assetsNegative = 0;
  for (const a of accounts) {
    const v = Number(a.balanceInBase);
    if (v >= 0) assetsPositive += v;
    else assetsNegative += Math.abs(v);
  }

  return {
    portfolio,
    pension,
    assetsNet: assetsPositive - assetsNegative,
    assetsPositive,
    assetsNegative,
    portfolioHoldingsCount: stockHoldings.length,
    pensionFundsCount: pensionFunds.length,
    accountsCount: accounts.length,
  };
}
