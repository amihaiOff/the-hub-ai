// Types for pension calculations

export type PensionAccountType = 'pension' | 'hishtalmut';

export interface Owner {
  id: string;
  name: string;
  image?: string | null;
  color?: string | null;
}

export interface DepositValue {
  id: string;
  depositDate: Date | string;
  salaryMonth: Date | string;
  amount: number;
  employer: string;
}

export interface PensionAccountSummary {
  id: string;
  type: PensionAccountType;
  providerName: string;
  accountName: string;
  currentValue: number;
  feeFromDeposit: number;
  feeFromTotal: number;
  totalDeposits: number;
  depositsCount: number;
  deposits: DepositValue[];
  owners?: Owner[];
}

export interface PensionSummary {
  userId: string;
  totalValue: number;
  totalDeposits: number;
  thisMonthDeposits: number;
  accountsCount: number;
  accounts: PensionAccountSummary[];
}

export interface AllocationItem {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

// Color palette for allocation chart
const ALLOCATION_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#06B6D4', // cyan-500
  '#F97316', // orange-500
  '#EC4899', // pink-500
  '#84CC16', // lime-500
  '#6366F1', // indigo-500
];

/**
 * Calculate total deposits for an array of deposits
 */
export function calculateTotalDeposits(deposits: DepositValue[]): number {
  return deposits.reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Calculate deposits for the current month across all accounts
 */
export function calculateThisMonthDeposits(accounts: PensionAccountSummary[]): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return accounts.reduce((total, account) => {
    const monthDeposits = account.deposits.filter((d) => {
      const salaryMonth = new Date(d.salaryMonth);
      return salaryMonth.getFullYear() === currentYear && salaryMonth.getMonth() === currentMonth;
    });
    return total + calculateTotalDeposits(monthDeposits);
  }, 0);
}

/**
 * Calculate pension summary from accounts
 */
export function calculatePensionSummary(
  userId: string,
  accounts: PensionAccountSummary[]
): PensionSummary {
  const totalValue = accounts.reduce((sum, a) => sum + a.currentValue, 0);
  const totalDeposits = accounts.reduce((sum, a) => sum + a.totalDeposits, 0);
  const thisMonthDeposits = calculateThisMonthDeposits(accounts);

  return {
    userId,
    totalValue,
    totalDeposits,
    thisMonthDeposits,
    accountsCount: accounts.length,
    accounts,
  };
}

/**
 * Calculate allocation by provider for pie chart
 */
export function calculateAllocationByProvider(accounts: PensionAccountSummary[]): AllocationItem[] {
  const totalValue = accounts.reduce((sum, a) => sum + a.currentValue, 0);

  if (totalValue === 0) return [];

  // Group by provider
  const byProvider = new Map<string, number>();
  for (const account of accounts) {
    const existing = byProvider.get(account.providerName) || 0;
    byProvider.set(account.providerName, existing + account.currentValue);
  }

  // Convert to array and sort by value descending
  return Array.from(byProvider.entries())
    .map(([name, value], index) => ({
      name,
      value,
      percentage: (value / totalValue) * 100,
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Calculate allocation by type (pension vs hishtalmut) for pie chart
 */
export function calculateAllocationByType(accounts: PensionAccountSummary[]): AllocationItem[] {
  const totalValue = accounts.reduce((sum, a) => sum + a.currentValue, 0);

  if (totalValue === 0) return [];

  const pension = accounts
    .filter((a) => a.type === 'pension')
    .reduce((sum, a) => sum + a.currentValue, 0);

  const hishtalmut = accounts
    .filter((a) => a.type === 'hishtalmut')
    .reduce((sum, a) => sum + a.currentValue, 0);

  const items: AllocationItem[] = [];

  if (pension > 0) {
    items.push({
      name: 'Pension',
      value: pension,
      percentage: (pension / totalValue) * 100,
      color: ALLOCATION_COLORS[0],
    });
  }

  if (hishtalmut > 0) {
    items.push({
      name: 'Hishtalmut',
      value: hishtalmut,
      percentage: (hishtalmut / totalValue) * 100,
      color: ALLOCATION_COLORS[1],
    });
  }

  return items.sort((a, b) => b.value - a.value);
}

/**
 * Format salary month for display (e.g., "Jan 2024")
 */
export function formatSalaryMonth(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Format deposit date for display (e.g., "15 Jan 2024")
 */
export function formatDepositDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Format fee percentage for display (e.g., "0.5%")
 */
export function formatFeePercent(value: number): string {
  return `${value.toFixed(2)}%`;
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
  }).format(value);
}

/**
 * Get month options for salary month picker (last 24 months)
 */
export function getSalaryMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 24; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: date.toISOString().split('T')[0],
      label: formatSalaryMonth(date),
    });
  }

  return options;
}

/**
 * Common Israeli pension providers for autocomplete
 */
export const PENSION_PROVIDERS = [
  'Meitav',
  'Altshuler Shaham',
  'Menora Mivtachim',
  'Migdal',
  'Harel',
  'Phoenix',
  'Clal',
  'Psagot',
  'More',
  'Amitim',
  'Yelin Lapidot',
];

/**
 * Get the display name for account type
 */
export function getAccountTypeName(type: PensionAccountType): string {
  return type === 'pension' ? 'Pension' : 'Hishtalmut';
}
