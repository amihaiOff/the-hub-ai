'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type CategoryGroupSummary,
  type BudgetPayee,
  formatCurrencyILS,
  getBudgetStatus,
} from '@/lib/utils/budget';
import { CategoryRow } from './category-row';
import { CategoryProgressBar } from './category-progress-bar';

interface CategoryGroupProps {
  group: CategoryGroupSummary;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
}

export function CategoryGroup({
  group,
  payees,
  isExpanded,
  onToggleExpand,
  expandedCategories,
  onToggleCategory,
}: CategoryGroupProps) {
  const status = getBudgetStatus(group.totalBudgeted, group.totalSpent);
  const availableColor =
    status === 'overspent'
      ? 'text-red-500'
      : status === 'funded'
        ? 'text-green-500'
        : status === 'underfunded'
          ? 'text-yellow-500'
          : 'text-muted-foreground';

  return (
    <Card>
      {/* Group Header */}
      <CardHeader className="p-0">
        <button
          onClick={onToggleExpand}
          className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-3 text-left transition-colors sm:gap-3 sm:px-4 sm:py-4"
        >
          {/* Expand Icon */}
          <span className="text-muted-foreground shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </span>

          {/* Group Name */}
          <span className="flex-1 text-base font-semibold sm:text-lg">{group.name}</span>

          {/* Desktop: Full stats */}
          <div className="hidden items-center gap-4 sm:flex">
            {/* Progress Bar */}
            <div className="w-32">
              <CategoryProgressBar budgeted={group.totalBudgeted} spent={group.totalSpent} />
            </div>

            {/* Budgeted */}
            <div className="w-24 text-right">
              <span className="text-muted-foreground text-xs">Budget</span>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrencyILS(group.totalBudgeted)}
              </p>
            </div>

            {/* Spent */}
            <div className="w-24 text-right">
              <span className="text-muted-foreground text-xs">Spent</span>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrencyILS(group.totalSpent)}
              </p>
            </div>

            {/* Available */}
            <div className="w-24 text-right">
              <span className="text-muted-foreground text-xs">Available</span>
              <p className={cn('text-sm font-semibold tabular-nums', availableColor)}>
                {formatCurrencyILS(group.totalAvailable)}
              </p>
            </div>
          </div>

          {/* Mobile: Compact stats */}
          <div className="flex flex-col items-end gap-0.5 sm:hidden">
            <span className={cn('text-sm font-semibold tabular-nums', availableColor)}>
              {formatCurrencyILS(group.totalAvailable)}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatCurrencyILS(group.totalSpent)} / {formatCurrencyILS(group.totalBudgeted)}
            </span>
          </div>
        </button>

        {/* Mobile Progress Bar */}
        <div className="px-10 pb-3 sm:hidden">
          <CategoryProgressBar budgeted={group.totalBudgeted} spent={group.totalSpent} />
        </div>
      </CardHeader>

      {/* Categories */}
      {isExpanded && (
        <CardContent className="border-t p-0">
          {group.categories.map((category) => (
            <CategoryRow
              key={category.categoryId}
              category={category}
              payees={payees}
              isExpanded={expandedCategories.has(category.categoryId)}
              onToggleExpand={() => onToggleCategory(category.categoryId)}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
