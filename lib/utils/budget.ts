// Budget module types and utilities

// Enums
export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'bank_import' | 'credit_card_import' | 'moneytor_sync';
export type PaymentMethod = 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'other';

// Interfaces
export interface BudgetTransaction {
  id: string;
  type: TransactionType;
  transactionDate: string;
  paymentDate: string;
  amountIls: number;
  currency: string;
  amountOriginal: number;
  categoryId: string | null;
  // AI category suggestion (transaction stays uncategorized until approved)
  suggestedCategoryId?: string | null;
  suggestedCategoryName?: string | null;
  suggestionConfidence?: number | null;
  payeeId: string | null;
  paymentMethod: PaymentMethod;
  paymentNumber: number | null;
  totalPayments: number | null;
  notes: string | null;
  source: TransactionSource;
  isRecurring: boolean;
  isSplit: boolean;
  originalTransactionId: string | null;
  paymentIdentifier: string | null;
  excludedFromFlow: boolean;
  profileId: string | null;
  householdId: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  groupId: string;
  budget: number | null;
  isMust: boolean;
  sortOrder: number;
  householdId: string;
}

export interface BudgetCategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
  householdId: string;
  categories: BudgetCategory[];
}

export interface BudgetPayee {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName?: string | null;
  neverDefault?: boolean;
  isBlacklisted?: boolean;
  transactionCount: number;
  householdId: string;
}

export interface BudgetTag {
  id: string;
  name: string;
  color: string;
  transactionCount: number;
  totalSpent: number;
  householdId: string;
}

export interface CategorySpending {
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
  budgeted: number;
  spent: number;
  available: number;
  isMust: boolean;
  transactions: BudgetTransaction[];
}

export interface BudgetMonthSummary {
  month: string; // YYYY-MM
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  categoryGroups: CategoryGroupSummary[];
}

export interface CategoryGroupSummary {
  id: string;
  name: string;
  sortOrder: number;
  totalBudgeted: number;
  totalSpent: number;
  totalAvailable: number;
  categories: CategorySpending[];
}

// Payee Category Rules
export type RuleOperator = 'contains' | 'starts_with' | 'ends_with' | 'equals';

export interface PayeeCategoryRule {
  id: string;
  name: string;
  operator: RuleOperator;
  value: string;
  // Either categoryId is set (assign a default category) OR markNeverDefault is
  // true (mark matching payees as neverDefault). Never both.
  categoryId: string | null;
  categoryName?: string | null;
  markNeverDefault?: boolean;
  sortOrder: number;
  isActive: boolean;
  householdId: string;
}

export const RULE_OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: 'Contains',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  equals: 'Equals',
};

/**
 * Check if a payee name matches a rule (case-insensitive).
 */
export function matchesPayeeRule(
  payeeName: string,
  operator: RuleOperator,
  value: string
): boolean {
  const name = payeeName.toLowerCase();
  const val = value.toLowerCase();
  switch (operator) {
    case 'contains':
      return name.includes(val);
    case 'starts_with':
      return name.startsWith(val);
    case 'ends_with':
      return name.endsWith(val);
    case 'equals':
      return name === val;
    default:
      return false;
  }
}

/**
 * Find the first matching active rule for a payee name (by sortOrder).
 * Rules must be pre-sorted by sortOrder ascending.
 */
export function findMatchingRule(
  rules: {
    operator: string;
    value: string;
    categoryId: string | null;
    markNeverDefault?: boolean;
    isActive: boolean;
  }[],
  payeeName: string
): { categoryId: string | null; markNeverDefault: boolean } | null {
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (matchesPayeeRule(payeeName, rule.operator as RuleOperator, rule.value)) {
      return {
        categoryId: rule.categoryId,
        markNeverDefault: rule.markNeverDefault === true,
      };
    }
  }
  return null;
}

// Progress bar status based on YNAB style
export type BudgetStatus = 'funded' | 'underfunded' | 'overspent' | 'zero';

export function getBudgetStatus(budgeted: number, spent: number): BudgetStatus {
  const available = budgeted - spent;
  if (budgeted === 0 && spent === 0) return 'zero';
  if (available < 0) return 'overspent';
  if (spent > 0 && available >= 0) return 'funded';
  if (budgeted > 0 && spent === 0) return 'funded';
  return 'underfunded';
}

// Formatting utilities
export function formatCurrencyILS(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyILSPrecise(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatMonth(monthString: string): string {
  const [year, month] = monthString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getPreviousMonth(monthString: string): string {
  const [year, month] = monthString.split('-').map(Number);
  const date = new Date(year, month - 2);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getNextMonth(monthString: string): string {
  const [year, month] = monthString.split('-').map(Number);
  const date = new Date(year, month);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Tag colors palette
export const TAG_COLORS = [
  '#EF4444', // red-500
  '#F97316', // orange-500
  '#F59E0B', // amber-500
  '#84CC16', // lime-500
  '#22C55E', // green-500
  '#10B981', // emerald-500
  '#06B6D4', // cyan-500
  '#3B82F6', // blue-500
  '#6366F1', // indigo-500
  '#8B5CF6', // violet-500
  '#A855F7', // purple-500
  '#EC4899', // pink-500
];

// Mock fixtures (MOCK_CATEGORY_GROUPS, MOCK_PAYEES, MOCK_TAGS,
// MOCK_TRANSACTIONS) live in `__tests__/fixtures/budget-fixtures.ts`
// — they're 1200+ lines and only used by the budget.test.ts unit
// tests, so they don't belong on the production utility surface.

// Calculate spending for a given month
export function calculateMonthSummary(
  month: string,
  transactions: BudgetTransaction[],
  categoryGroups: BudgetCategoryGroup[]
): BudgetMonthSummary {
  const monthTransactions = transactions.filter((tx) => tx.transactionDate.startsWith(month));

  const totalIncome = monthTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amountIls, 0);

  const totalSpent = monthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amountIls, 0);

  const categoryGroupSummaries: CategoryGroupSummary[] = categoryGroups.map((group) => {
    const categorySpending: CategorySpending[] = group.categories.map((category) => {
      const categoryTransactions = monthTransactions.filter(
        (tx) => tx.categoryId === category.id && tx.type === 'expense'
      );
      const spent = categoryTransactions.reduce((sum, tx) => sum + tx.amountIls, 0);
      const budgeted = category.budget || 0;

      return {
        categoryId: category.id,
        categoryName: category.name,
        groupId: group.id,
        groupName: group.name,
        budgeted,
        spent,
        available: budgeted - spent,
        isMust: category.isMust,
        transactions: categoryTransactions,
      };
    });

    const totalGroupBudgeted = categorySpending.reduce((sum, c) => sum + c.budgeted, 0);
    const totalGroupSpent = categorySpending.reduce((sum, c) => sum + c.spent, 0);

    return {
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      totalBudgeted: totalGroupBudgeted,
      totalSpent: totalGroupSpent,
      totalAvailable: totalGroupBudgeted - totalGroupSpent,
      categories: categorySpending,
    };
  });

  const totalBudgeted = categoryGroupSummaries.reduce((sum, g) => sum + g.totalBudgeted, 0);

  return {
    month,
    totalBudgeted,
    totalSpent,
    totalIncome,
    categoryGroups: categoryGroupSummaries,
  };
}

// Get payee name by id
export function getPayeeName(payeeId: string | null, payees: BudgetPayee[]): string {
  if (!payeeId) return 'Unknown';
  const payee = payees.find((p) => p.id === payeeId);
  return payee?.name || 'Unknown';
}

// Get category name by id
export function getCategoryName(
  categoryId: string | null,
  categoryGroups: BudgetCategoryGroup[]
): string {
  if (!categoryId) return 'Uncategorized';
  for (const group of categoryGroups) {
    const category = group.categories.find((c) => c.id === categoryId);
    if (category) return category.name;
  }
  return 'Uncategorized';
}

// Get category with group name
export function getCategoryWithGroup(
  categoryId: string | null,
  categoryGroups: BudgetCategoryGroup[]
): { groupName: string; categoryName: string } | null {
  if (!categoryId) return null;
  for (const group of categoryGroups) {
    const category = group.categories.find((c) => c.id === categoryId);
    if (category) {
      return { groupName: group.name, categoryName: category.name };
    }
  }
  return null;
}
