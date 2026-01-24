'use client';

import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CategorySpending,
  type BudgetPayee,
  formatCurrencyILS,
  getBudgetStatus,
} from '@/lib/utils/budget';
import { CategoryProgressBar } from './category-progress-bar';
import { CategoryTransactionsMini } from './category-transactions-mini';

interface CategoryRowProps {
  category: CategorySpending;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function CategoryRow({ category, payees, isExpanded, onToggleExpand }: CategoryRowProps) {
  const status = getBudgetStatus(category.budgeted, category.spent);
  const availableColor =
    status === 'overspent'
      ? 'text-red-500'
      : status === 'funded'
        ? 'text-green-500'
        : status === 'underfunded'
          ? 'text-yellow-500'
          : 'text-muted-foreground';

  return (
    <div className="border-border border-b last:border-b-0">
      {/* Main Row */}
      <button
        onClick={onToggleExpand}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-2 py-2 text-left transition-colors sm:gap-3 sm:px-3 sm:py-3"
      >
        {/* Expand Icon */}
        <span className="text-muted-foreground shrink-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        {/* Category Name + Must Star */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{category.categoryName}</span>
          {category.isMust && <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />}
        </div>

        {/* Desktop: Full stats */}
        <div className="hidden items-center gap-4 sm:flex">
          {/* Progress Bar */}
          <div className="w-32">
            <CategoryProgressBar budgeted={category.budgeted} spent={category.spent} />
          </div>

          {/* Budgeted */}
          <div className="w-24 text-right">
            <span className="text-muted-foreground text-xs">Budget</span>
            <p className="text-sm font-medium tabular-nums">
              {formatCurrencyILS(category.budgeted)}
            </p>
          </div>

          {/* Spent */}
          <div className="w-24 text-right">
            <span className="text-muted-foreground text-xs">Spent</span>
            <p className="text-sm font-medium tabular-nums">{formatCurrencyILS(category.spent)}</p>
          </div>

          {/* Available */}
          <div className="w-24 text-right">
            <span className="text-muted-foreground text-xs">Available</span>
            <p className={cn('text-sm font-medium tabular-nums', availableColor)}>
              {formatCurrencyILS(category.available)}
            </p>
          </div>
        </div>

        {/* Mobile: Compact stats */}
        <div className="flex flex-col items-end gap-0.5 sm:hidden">
          <span className={cn('text-sm font-medium tabular-nums', availableColor)}>
            {formatCurrencyILS(category.available)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatCurrencyILS(category.spent)} / {formatCurrencyILS(category.budgeted)}
          </span>
        </div>
      </button>

      {/* Mobile Progress Bar */}
      <div className="px-9 pb-2 sm:hidden">
        <CategoryProgressBar budgeted={category.budgeted} spent={category.spent} />
      </div>

      {/* Expanded Content - Mini Transactions */}
      {isExpanded && (
        <div className="bg-muted/30 border-t px-3 py-2 sm:px-6">
          <CategoryTransactionsMini transactions={category.transactions} payees={payees} />
        </div>
      )}
    </div>
  );
}
