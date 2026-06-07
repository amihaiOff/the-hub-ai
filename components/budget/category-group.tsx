'use client';

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
import { CategoryGroupIcon, getGroupIconColor } from '@/lib/utils/category-group-icons';

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
  const iconColor = getGroupIconColor(group.name);

  const leftColor =
    status === 'overspent'
      ? 'text-red-500'
      : status === 'funded'
        ? 'text-foreground'
        : status === 'underfunded'
          ? 'text-foreground'
          : 'text-muted-foreground';

  const usedPercent = group.totalBudgeted > 0 ? (group.totalSpent / group.totalBudgeted) * 100 : 0;
  const usedColor = status === 'overspent' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          onClick={onToggleExpand}
          className="hover:bg-muted/40 active:bg-muted/60 flex w-full flex-col gap-3 rounded-xl p-4 text-left transition-colors"
          aria-expanded={isExpanded}
        >
          {/* Top row: icon + name + right-side amounts */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                iconColor
              )}
            >
              <CategoryGroupIcon groupName={group.name} className="h-6 w-6" />
            </span>

            <span className="flex-1 truncate text-xl font-bold sm:text-2xl">{group.name}</span>

            <div className="shrink-0 text-right">
              <div className={cn('text-base font-semibold tabular-nums', leftColor)} dir="ltr">
                <bdi>{formatCurrencyILS(group.totalAvailable)}</bdi> left
              </div>
              <div className="text-muted-foreground text-xs tabular-nums" dir="ltr">
                of <bdi>{formatCurrencyILS(group.totalBudgeted)}</bdi>
              </div>
            </div>
          </div>

          {/* Progress bar (full width, no inline stats) */}
          <CategoryProgressBar
            budgeted={group.totalBudgeted}
            spent={group.totalSpent}
            showStats={false}
            showDateIndicator={false}
          />

          {/* Bottom row: Spent left, % used right */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground tabular-nums" dir="ltr">
              Spent: <bdi>{formatCurrencyILS(group.totalSpent)}</bdi>
            </span>
            <span className={cn('font-medium tabular-nums', usedColor)}>
              {usedPercent.toFixed(usedPercent >= 10 ? 0 : 1)}% used
            </span>
          </div>
        </button>
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
