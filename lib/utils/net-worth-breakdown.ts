import type { MiscAssetType, PensionAccountType } from '@prisma/client';

/**
 * Total-worth broken into the categories shown on the dashboard. All figures
 * are in ILS. By construction the parts reconcile to net worth:
 *
 *   netWorth = portfolio + pension + hishtalmut + realEstate + otherAssets - debts
 *
 * Per product decision, cash/savings (bank & deposit balances) are folded into
 * `portfolio` rather than shown as their own line.
 */
export interface NetWorthBreakdown {
  /** Stock portfolio value + cash/savings (bank balances, deposits). */
  portfolio: number;
  /** Retirement pension only (excludes hishtalmut). */
  pension: number;
  /** Hishtalmut / study funds. */
  hishtalmut: number;
  /** Real estate. */
  realEstate: number;
  /** Positive misc assets that aren't cash/savings (rare — catch-all). */
  otherAssets: number;
  /** Total liabilities as a positive magnitude (subtracted from net worth). */
  debts: number;
  /** Sum of the parts above (debts subtracted) — equals total net worth. */
  netWorth: number;
}

export interface NetWorthBreakdownInput {
  /**
   * Stock portfolio value in ILS (manual holdings + Moneytor), including any
   * cash held inside stock/brokerage accounts.
   */
  portfolioValue: number;
  /** Manual pension accounts (`currentValue` in ILS). */
  manualPension: { type: PensionAccountType; currentValue: number }[];
  /** Manual misc assets/debts (`currentValue` signed: +asset, −debt). */
  manualMisc: { type: MiscAssetType; currentValue: number }[];
  /** Moneytor-sourced totals (all ILS). */
  moneytor: {
    /** Pension + hishtalmut together. */
    pension: number;
    /** Hishtalmut subset of `pension`. */
    hishtalmut: number;
    /** Positive bank/account balances (savings, current, deposits). */
    bank: number;
    /** Liabilities as a positive magnitude. */
    debts: number;
    /** Real estate. */
    realEstate: number;
  };
}

/** Misc-asset types treated as cash/savings (folded into `portfolio`). */
const SAVINGS_MISC_TYPES: readonly MiscAssetType[] = ['bank_deposit', 'child_savings'];

/**
 * Split total net worth into dashboard categories. Pure — takes already-valued
 * ILS inputs so it is trivially unit-testable and reconciles exactly.
 */
export function computeNetWorthBreakdown(input: NetWorthBreakdownInput): NetWorthBreakdown {
  const { portfolioValue, manualPension, manualMisc, moneytor } = input;

  // Pension vs. hishtalmut (manual + Moneytor). The manual list carries both
  // types; subtract hishtalmut back out to get retirement-only pension.
  let manualPensionAll = 0;
  let manualHishtalmut = 0;
  for (const p of manualPension) {
    manualPensionAll += p.currentValue;
    if (p.type === 'hishtalmut') manualHishtalmut += p.currentValue;
  }
  const hishtalmut = manualHishtalmut + moneytor.hishtalmut;
  const pension = manualPensionAll - manualHishtalmut + (moneytor.pension - moneytor.hishtalmut);

  // Manual misc: positive rows are savings (bank_deposit/child_savings) or a
  // catch-all "other asset"; negative rows are debts.
  let savingsManual = 0;
  let otherAssets = 0;
  let manualDebts = 0;
  for (const m of manualMisc) {
    const v = m.currentValue;
    if (v >= 0) {
      if (SAVINGS_MISC_TYPES.includes(m.type)) savingsManual += v;
      else otherAssets += v;
    } else {
      manualDebts += Math.abs(v);
    }
  }

  const portfolio = portfolioValue + moneytor.bank + savingsManual;
  const debts = manualDebts + moneytor.debts;
  const realEstate = moneytor.realEstate;

  const netWorth = portfolio + pension + hishtalmut + realEstate + otherAssets - debts;

  return { portfolio, pension, hishtalmut, realEstate, otherAssets, debts, netWorth };
}
