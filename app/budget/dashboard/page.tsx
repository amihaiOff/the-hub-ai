'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useBudgetMonthSummary,
  usePayees,
  useSelectedMonth,
  useExpandedGroups,
  useExpandedCategories,
} from '@/lib/hooks/use-budget';
import {
  BudgetSummary,
  MonthSelector,
  CategoryProgressBar,
  CategoryTransactionsMini,
} from '@/components/budget';
import { AddTransactionDialog } from '@/components/budget/add-transaction-dialog';
import { cn } from '@/lib/utils';
import {
  formatCurrencyILS,
  getBudgetStatus,
  type CategorySpending,
  type BudgetPayee,
} from '@/lib/utils/budget';

interface CategoryRowProps {
  category: CategorySpending;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedMonth: string;
}

function CategoryTableRow({
  category,
  payees,
  isExpanded,
  onToggleExpand,
  selectedMonth,
}: CategoryRowProps) {
  const status = getBudgetStatus(category.budgeted, category.spent);
  const availableColor =
    status === 'overspent'
      ? 'text-red-500'
      : status === 'funded'
        ? 'text-green-500'
        : status === 'underfunded'
          ? 'text-yellow-500'
          : 'text-muted-foreground';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggleExpand();
    }
  };

  return (
    <>
      <tr
        className="hover:bg-muted/30 focus:ring-ring cursor-pointer border-b transition-colors focus:ring-2 focus:outline-none focus:ring-inset"
        onClick={onToggleExpand}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Category Name with expand icon */}
        <td className="px-4 py-3 pl-8">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
            <span className="font-medium">{category.categoryName}</span>
          </div>
        </td>
        {/* Progress Bar - Hidden on mobile */}
        <td className="hidden px-4 py-3 sm:table-cell">
          <CategoryProgressBar
            budgeted={category.budgeted}
            spent={category.spent}
            selectedMonth={selectedMonth}
          />
        </td>
        {/* Budget */}
        <td className="hidden px-4 py-3 text-right lg:table-cell">
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatCurrencyILS(category.budgeted)}
          </span>
        </td>
        {/* Spent */}
        <td className="hidden px-4 py-3 text-right lg:table-cell">
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatCurrencyILS(category.spent)}
          </span>
        </td>
        {/* Available */}
        <td className="px-4 py-3 text-right">
          <span className={cn('text-sm font-medium tabular-nums', availableColor)}>
            {formatCurrencyILS(category.available)}
          </span>
          {/* Mobile: Show compact spent/budget below */}
          <div className="text-muted-foreground text-xs tabular-nums lg:hidden">
            {formatCurrencyILS(category.spent)} / {formatCurrencyILS(category.budgeted)}
          </div>
        </td>
      </tr>
      {/* Mobile Progress Bar */}
      <tr className="border-b sm:hidden">
        <td colSpan={2} className="px-4 pb-2 pl-14">
          <CategoryProgressBar
            budgeted={category.budgeted}
            spent={category.spent}
            selectedMonth={selectedMonth}
            showStats={false}
          />
        </td>
      </tr>
      {/* Expanded Transactions */}
      {isExpanded && (
        <tr className="border-b">
          <td colSpan={5} className="bg-muted/30 px-4 py-2 pl-14">
            <CategoryTransactionsMini transactions={category.transactions} payees={payees} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function BudgetDashboardPage() {
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();
  const { data: monthSummary, isLoading, error } = useBudgetMonthSummary(selectedMonth);
  const { data: payees = [] } = usePayees();
  const { expandedGroups, toggleGroup, expandAll, collapseAll } = useExpandedGroups();
  const { expandedCategories, toggleCategory } = useExpandedCategories();
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  // Expand all groups by default when data loads
  const allGroupIds = monthSummary?.categoryGroups.map((g) => g.id) || [];
  const allExpanded = allGroupIds.length > 0 && allGroupIds.every((id) => expandedGroups.has(id));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
            Monthly Budget
          </h1>
          <p className="text-muted-foreground text-sm">Track your spending against your budget</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
          <Button onClick={() => setShowAddTransaction(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Transaction</span>
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load budget data</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Summary */}
      <BudgetSummary
        totalBudgeted={monthSummary?.totalBudgeted ?? 0}
        totalSpent={monthSummary?.totalSpent ?? 0}
        totalIncome={monthSummary?.totalIncome ?? 0}
        isLoading={isLoading}
      />

      {/* Category Groups Table */}
      <div className="space-y-3 sm:space-y-4">
        {/* Expand/Collapse All */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold sm:text-lg">Categories</h2>
          <div className="flex gap-2">
            {isLoading && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (allExpanded ? collapseAll() : expandAll(allGroupIds))}
              disabled={isLoading || !monthSummary}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          // Loading skeleton
          <Card>
            <CardContent className="py-4">
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-10 animate-pulse rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : monthSummary?.categoryGroups && monthSummary.categoryGroups.length > 0 ? (
          // Unified table with groups and categories
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="w-48 px-4 py-3 text-left text-sm font-medium">Category</th>
                    <th className="hidden px-4 py-3 text-left text-sm font-medium sm:table-cell">
                      Progress
                    </th>
                    <th className="hidden w-28 px-4 py-3 text-right text-sm font-medium lg:table-cell">
                      Budget
                    </th>
                    <th className="hidden w-28 px-4 py-3 text-right text-sm font-medium lg:table-cell">
                      Spent
                    </th>
                    <th className="w-32 px-4 py-3 text-right text-sm font-medium">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {monthSummary.categoryGroups.map((group) => {
                    const isGroupExpanded = expandedGroups.has(group.id);
                    const groupStatus = getBudgetStatus(group.totalBudgeted, group.totalSpent);
                    const groupAvailableColor =
                      groupStatus === 'overspent'
                        ? 'text-red-500'
                        : groupStatus === 'funded'
                          ? 'text-green-500'
                          : groupStatus === 'underfunded'
                            ? 'text-yellow-500'
                            : 'text-muted-foreground';

                    const handleGroupKeyDown = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleGroup(group.id);
                      }
                    };

                    return (
                      <Fragment key={group.id}>
                        {/* Group Row - Highlighted */}
                        <tr
                          className="bg-muted/30 hover:bg-muted/50 focus:ring-ring cursor-pointer border-b focus:ring-2 focus:outline-none focus:ring-inset"
                          onClick={() => toggleGroup(group.id)}
                          onKeyDown={handleGroupKeyDown}
                          tabIndex={0}
                          role="button"
                          aria-expanded={isGroupExpanded}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground shrink-0">
                                {isGroupExpanded ? (
                                  <ChevronDown className="h-5 w-5" />
                                ) : (
                                  <ChevronRight className="h-5 w-5" />
                                )}
                              </span>
                              <span className="text-base font-semibold">{group.name}</span>
                              <span className="text-muted-foreground text-sm">
                                ({group.categories.length})
                              </span>
                            </div>
                          </td>
                          {/* Progress Bar - Hidden on mobile */}
                          <td className="hidden px-4 py-4 sm:table-cell">
                            <CategoryProgressBar
                              budgeted={group.totalBudgeted}
                              spent={group.totalSpent}
                              selectedMonth={selectedMonth}
                            />
                          </td>
                          {/* Budget */}
                          <td className="hidden px-4 py-4 text-right lg:table-cell">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatCurrencyILS(group.totalBudgeted)}
                            </span>
                          </td>
                          {/* Spent */}
                          <td className="hidden px-4 py-4 text-right lg:table-cell">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatCurrencyILS(group.totalSpent)}
                            </span>
                          </td>
                          {/* Available */}
                          <td className="px-4 py-4 text-right">
                            <span
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                groupAvailableColor
                              )}
                            >
                              {formatCurrencyILS(group.totalAvailable)}
                            </span>
                            {/* Mobile: Show compact spent/budget below */}
                            <div className="text-muted-foreground text-xs tabular-nums lg:hidden">
                              {formatCurrencyILS(group.totalSpent)} /{' '}
                              {formatCurrencyILS(group.totalBudgeted)}
                            </div>
                          </td>
                        </tr>
                        {/* Mobile Progress Bar for Group */}
                        <tr className="bg-muted/30 border-b sm:hidden">
                          <td colSpan={2} className="px-4 pb-3 pl-12">
                            <CategoryProgressBar
                              budgeted={group.totalBudgeted}
                              spent={group.totalSpent}
                              selectedMonth={selectedMonth}
                              showStats={false}
                            />
                          </td>
                        </tr>

                        {/* Category Rows (when expanded) */}
                        {isGroupExpanded &&
                          group.categories.map((category) => (
                            <CategoryTableRow
                              key={category.categoryId}
                              category={category}
                              payees={payees}
                              isExpanded={expandedCategories.has(category.categoryId)}
                              onToggleExpand={() => toggleCategory(category.categoryId)}
                              selectedMonth={selectedMonth}
                            />
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          // Empty state
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-muted-foreground">No categories set up yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Create categories to start tracking your budget
                </p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/budget/categories">Set Up Categories</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Transaction Dialog */}
      <AddTransactionDialog open={showAddTransaction} onOpenChange={setShowAddTransaction} />
    </div>
  );
}
