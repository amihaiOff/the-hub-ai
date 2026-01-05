// Types for misc assets

export type MiscAssetType = 'bank_deposit' | 'loan' | 'mortgage' | 'child_savings';

export interface Owner {
  id: string;
  name: string;
  image?: string | null;
  color?: string | null;
}

export interface MiscAsset {
  id: string;
  type: MiscAssetType;
  name: string;
  currentValue: number;
  interestRate: number;
  monthlyPayment: number | null;
  monthlyDeposit: number | null;
  maturityDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  owners?: Owner[];
}

export interface AssetsSummary {
  userId: string;
  totalAssets: number;
  totalLiabilities: number;
  netValue: number;
  itemsCount: number;
  items: MiscAsset[];
}

export interface AssetTypeConfig {
  label: string;
  description: string;
  isLiability: boolean;
  hasMonthlyPayment: boolean;
  hasMonthlyDeposit: boolean;
  hasMaturityDate: boolean;
  icon: string;
}

// Asset type configurations
export const ASSET_TYPE_CONFIGS: Record<MiscAssetType, AssetTypeConfig> = {
  bank_deposit: {
    label: 'Bank Deposit',
    description: 'Savings account, CD, or fixed deposit',
    isLiability: false,
    hasMonthlyPayment: false,
    hasMonthlyDeposit: false,
    hasMaturityDate: true,
    icon: 'Landmark',
  },
  loan: {
    label: 'Loan',
    description: 'Personal loan, car loan, or other debt',
    isLiability: true,
    hasMonthlyPayment: true,
    hasMonthlyDeposit: false,
    hasMaturityDate: true,
    icon: 'CreditCard',
  },
  mortgage: {
    label: 'Mortgage',
    description: 'Home mortgage or property loan',
    isLiability: true,
    hasMonthlyPayment: true,
    hasMonthlyDeposit: false,
    hasMaturityDate: true,
    icon: 'Home',
  },
  child_savings: {
    label: 'Child Savings',
    description: 'Savings account for a child',
    isLiability: false,
    hasMonthlyPayment: false,
    hasMonthlyDeposit: true,
    hasMaturityDate: false,
    icon: 'Baby',
  },
};

/**
 * Get configuration for an asset type
 */
export function getAssetTypeConfig(type: MiscAssetType): AssetTypeConfig {
  return ASSET_TYPE_CONFIGS[type];
}

/**
 * Format asset type for display
 */
export function formatAssetType(type: MiscAssetType): string {
  return ASSET_TYPE_CONFIGS[type].label;
}

/**
 * Check if asset type is a liability
 */
export function isLiability(type: MiscAssetType): boolean {
  return ASSET_TYPE_CONFIGS[type].isLiability;
}

/**
 * Format interest rate for display (e.g., "5.00%")
 */
export function formatInterestRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

/**
 * Format currency value for display
 */
export function formatCurrency(value: number, currency = 'ILS'): string {
  return new Intl.NumberFormat(currency === 'ILS' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Calculate maturity value with compound interest
 * Formula: A = P(1 + r/n)^(nt)
 * Where: P = principal, r = annual rate, n = compounds per year, t = years
 */
export function calculateMaturityValue(
  principal: number,
  annualRate: number,
  monthsToMaturity: number,
  compoundsPerYear = 12
): number {
  if (monthsToMaturity <= 0) return principal;
  const r = annualRate / 100; // Convert percentage to decimal
  const t = monthsToMaturity / 12; // Convert months to years
  return principal * Math.pow(1 + r / compoundsPerYear, compoundsPerYear * t);
}

/**
 * Calculate total interest earned on a bank deposit at maturity
 */
export function calculateDepositInterest(
  principal: number,
  annualRate: number,
  monthsToMaturity: number
): number {
  const maturityValue = calculateMaturityValue(principal, annualRate, monthsToMaturity);
  return maturityValue - principal;
}

/**
 * Calculate months to payoff for a loan with fixed monthly payment
 * Using: n = -log(1 - (P*r/m)) / log(1 + r)
 * Where: P = principal, r = monthly rate, m = monthly payment
 */
export function calculateMonthsToPayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): number | null {
  if (monthlyPayment <= 0 || balance <= 0) return null;

  const monthlyRate = annualRate / 100 / 12;

  // Check if payment is enough to cover interest
  const interestOnly = Math.abs(balance) * monthlyRate;
  if (monthlyPayment <= interestOnly) return null; // Payment too low, will never pay off

  // Calculate months using amortization formula
  const n =
    -Math.log(1 - (Math.abs(balance) * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(n);
}

/**
 * Calculate payoff date for a loan
 */
export function calculatePayoffDate(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): Date | null {
  const months = calculateMonthsToPayoff(balance, annualRate, monthlyPayment);
  if (months === null) return null;

  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return payoffDate;
}

/**
 * Calculate total interest to be paid on a loan
 */
export function calculateTotalLoanInterest(
  balance: number,
  annualRate: number,
  monthlyPayment: number
): number | null {
  const months = calculateMonthsToPayoff(balance, annualRate, monthlyPayment);
  if (months === null) return null;

  const totalPaid = monthlyPayment * months;
  return totalPaid - Math.abs(balance);
}

/**
 * Calculate future value of child savings with regular monthly deposits
 * Formula: FV = P(1+r)^n + PMT * (((1+r)^n - 1) / r)
 * Where: P = current balance, r = monthly rate, n = months, PMT = monthly deposit
 */
export function calculateChildSavingsProjection(
  currentValue: number,
  monthlyDeposit: number,
  annualRate: number,
  yearsUntilMaturity: number
): number {
  const monthlyRate = annualRate / 100 / 12;
  const months = yearsUntilMaturity * 12;

  if (monthlyRate === 0) {
    return currentValue + monthlyDeposit * months;
  }

  // Future value of current balance
  const fvPrincipal = currentValue * Math.pow(1 + monthlyRate, months);

  // Future value of monthly deposits (annuity)
  const fvDeposits = monthlyDeposit * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

  return fvPrincipal + fvDeposits;
}

/**
 * Get months until a date
 */
export function getMonthsUntilDate(date: Date | string | null): number {
  if (!date) return 0;
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(0, months);
}

/**
 * Separate assets and liabilities from a list of items
 */
export function separateAssetsByType(items: MiscAsset[]): {
  assets: MiscAsset[];
  liabilities: MiscAsset[];
} {
  const assets: MiscAsset[] = [];
  const liabilities: MiscAsset[] = [];

  for (const item of items) {
    if (isLiability(item.type) || item.currentValue < 0) {
      liabilities.push(item);
    } else {
      assets.push(item);
    }
  }

  return { assets, liabilities };
}

/**
 * Get all asset type options for select dropdowns
 */
export function getAssetTypeOptions(): {
  value: MiscAssetType;
  label: string;
  description: string;
}[] {
  return Object.entries(ASSET_TYPE_CONFIGS).map(([type, config]) => ({
    value: type as MiscAssetType,
    label: config.label,
    description: config.description,
  }));
}
