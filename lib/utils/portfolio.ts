// Types for portfolio calculations
// Prisma Decimal comes as an object with toNumber() method, but we handle it generically
interface DecimalLike {
  toNumber(): number;
}

export interface HoldingWithPrice {
  id: string;
  symbol: string;
  quantity: DecimalLike | number | string;
  avgCostBasis: DecimalLike | number | string;
  currentPrice: DecimalLike | number | string;
}

export interface HoldingValue {
  id: string;
  symbol: string;
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
}

export interface AccountSummary {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: HoldingValue[];
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  totalHoldings: number;
  accounts: AccountSummary[];
}

export interface AllocationItem {
  symbol: string;
  value: number;
  percentage: number;
  color: string;
}

// Helper to convert Decimal/string/number to number
function toNumber(value: DecimalLike | number | string): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return value.toNumber();
  }
  if (typeof value === 'string') {
    return parseFloat(value);
  }
  return value as number;
}

/**
 * Calculate the current value of a single holding
 * Formula: quantity × currentPrice
 */
export function calculateHoldingValue(
  quantity: DecimalLike | number | string,
  currentPrice: DecimalLike | number | string
): number {
  const qty = toNumber(quantity);
  const price = toNumber(currentPrice);
  return qty * price;
}

/**
 * Calculate the cost basis of a holding
 * Formula: quantity × avgCostBasis
 */
export function calculateCostBasis(
  quantity: DecimalLike | number | string,
  avgCostBasis: DecimalLike | number | string
): number {
  const qty = toNumber(quantity);
  const cost = toNumber(avgCostBasis);
  return qty * cost;
}

/**
 * Calculate gain/loss for a holding
 * Formula: currentValue - costBasis
 */
export function calculateGainLoss(currentValue: number, costBasis: number): number {
  return currentValue - costBasis;
}

/**
 * Calculate gain/loss percentage
 * Formula: ((currentValue - costBasis) / costBasis) × 100
 */
export function calculateGainLossPercent(currentValue: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return ((currentValue - costBasis) / costBasis) * 100;
}

/**
 * Calculate all values for a single holding
 */
export function calculateHoldingDetails(holding: HoldingWithPrice): HoldingValue {
  const quantity = toNumber(holding.quantity);
  const avgCostBasis = toNumber(holding.avgCostBasis);
  const currentPrice = toNumber(holding.currentPrice);

  const currentValue = calculateHoldingValue(quantity, currentPrice);
  const costBasis = calculateCostBasis(quantity, avgCostBasis);
  const gainLoss = calculateGainLoss(currentValue, costBasis);
  const gainLossPercent = calculateGainLossPercent(currentValue, costBasis);

  return {
    id: holding.id,
    symbol: holding.symbol,
    quantity,
    avgCostBasis,
    currentPrice,
    currentValue,
    costBasis,
    gainLoss,
    gainLossPercent,
  };
}

/**
 * Calculate total value for an array of holdings
 */
export function calculateAccountTotal(holdings: HoldingValue[]): number {
  return holdings.reduce((sum, holding) => sum + holding.currentValue, 0);
}

/**
 * Calculate total cost basis for an array of holdings
 */
export function calculateAccountCostBasis(holdings: HoldingValue[]): number {
  return holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
}

/**
 * Calculate account summary with all holdings
 */
export function calculateAccountSummary(
  account: {
    id: string;
    name: string;
    broker: string | null;
    currency?: string;
    holdings: HoldingWithPrice[];
  }
): AccountSummary {
  const holdingValues = account.holdings.map(calculateHoldingDetails);
  const totalValue = calculateAccountTotal(holdingValues);
  const totalCostBasis = calculateAccountCostBasis(holdingValues);
  const totalGainLoss = calculateGainLoss(totalValue, totalCostBasis);
  const totalGainLossPercent = calculateGainLossPercent(totalValue, totalCostBasis);

  return {
    id: account.id,
    name: account.name,
    broker: account.broker,
    currency: account.currency || 'USD',
    totalValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPercent,
    holdings: holdingValues,
  };
}

/**
 * Calculate complete portfolio summary across all accounts
 */
export function calculatePortfolioSummary(
  accounts: Array<{
    id: string;
    name: string;
    broker: string | null;
    currency?: string;
    holdings: HoldingWithPrice[];
  }>
): PortfolioSummary {
  const accountSummaries = accounts.map(calculateAccountSummary);

  const totalValue = accountSummaries.reduce((sum, account) => sum + account.totalValue, 0);
  const totalCostBasis = accountSummaries.reduce((sum, account) => sum + account.totalCostBasis, 0);
  const totalGainLoss = calculateGainLoss(totalValue, totalCostBasis);
  const totalGainLossPercent = calculateGainLossPercent(totalValue, totalCostBasis);
  const totalHoldings = accountSummaries.reduce(
    (sum, account) => sum + account.holdings.length,
    0
  );

  return {
    totalValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPercent,
    totalHoldings,
    accounts: accountSummaries,
  };
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
 * Calculate allocation percentages for pie chart
 */
export function calculateAllocation(accounts: AccountSummary[]): AllocationItem[] {
  // Aggregate holdings by symbol across all accounts
  const holdingsBySymbol = new Map<string, number>();

  for (const account of accounts) {
    for (const holding of account.holdings) {
      const existing = holdingsBySymbol.get(holding.symbol) || 0;
      holdingsBySymbol.set(holding.symbol, existing + holding.currentValue);
    }
  }

  const totalValue = Array.from(holdingsBySymbol.values()).reduce((sum, value) => sum + value, 0);

  if (totalValue === 0) return [];

  // Convert to array and sort by value descending
  const allocation: AllocationItem[] = Array.from(holdingsBySymbol.entries())
    .map(([symbol, value], index) => ({
      symbol,
      value,
      percentage: (value / totalValue) * 100,
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);

  return allocation;
}

/**
 * Format currency value for display
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format quantity (supports fractional shares)
 */
export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(4);
}
