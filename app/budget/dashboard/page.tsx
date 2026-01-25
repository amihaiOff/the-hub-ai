'use client';

import { useState, Fragment, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { cn } from '@/lib/utils';
import {
  formatCurrencyILS,
  getBudgetStatus,
  type CategorySpending,
  type BudgetPayee,
  type CategoryGroupSummary,
} from '@/lib/utils/budget';

// Hook to persist group order in localStorage
function useGroupOrder(groupIds: string[]) {
  // State holds the user's saved order (from localStorage or manual reorder)
  const [savedOrder, setSavedOrder] = useState<string[]>(() => {
    // Initialize from localStorage on first render (client-side only)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('budget-group-order');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return [];
        }
      }
    }
    return [];
  });

  // Compute the effective order: saved order filtered to existing groups + any new groups
  const order = useMemo(() => {
    if (groupIds.length === 0) return [];
    const existingOrdered = savedOrder.filter((id) => groupIds.includes(id));
    const newGroups = groupIds.filter((id) => !savedOrder.includes(id));
    return [...existingOrdered, ...newGroups];
  }, [groupIds, savedOrder]);

  const updateOrder = (newOrder: string[]) => {
    setSavedOrder(newOrder);
    localStorage.setItem('budget-group-order', JSON.stringify(newOrder));
  };

  return { order, updateOrder };
}

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

  return (
    <>
      <tr
        className="hover:bg-muted/30 cursor-pointer border-b transition-colors"
        onClick={onToggleExpand}
      >
        {/* Category Name */}
        <td className="w-36 py-2.5 pr-2 pl-8 sm:w-44">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/70 shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="truncate text-sm">{category.categoryName}</span>
          </div>
        </td>
        {/* Progress Bar with date indicator */}
        <td className="px-2 py-2.5">
          <CategoryProgressBar
            budgeted={category.budgeted}
            spent={category.spent}
            selectedMonth={selectedMonth}
          />
        </td>
        {/* Spent / Budget */}
        <td className="hidden w-28 px-2 py-2.5 text-right lg:table-cell">
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatCurrencyILS(category.spent)}
          </span>
          <span className="text-muted-foreground/40 mx-0.5 text-xs">/</span>
          <span className="text-muted-foreground/60 text-xs tabular-nums">
            {formatCurrencyILS(category.budgeted)}
          </span>
        </td>
        {/* Available */}
        <td className="w-20 py-2.5 pr-3 pl-2 text-right sm:w-24">
          <span className={cn('text-sm font-medium tabular-nums', availableColor)}>
            {formatCurrencyILS(category.available)}
          </span>
          {/* Mobile: spent/budget */}
          <div className="text-muted-foreground text-[10px] tabular-nums lg:hidden">
            {formatCurrencyILS(category.spent)}/{formatCurrencyILS(category.budgeted)}
          </div>
        </td>
      </tr>
      {/* Expanded Transactions */}
      {isExpanded && (
        <tr className="border-b">
          <td colSpan={4} className="bg-muted/20 px-4 py-2.5 pl-12">
            <CategoryTransactionsMini transactions={category.transactions} payees={payees} />
          </td>
        </tr>
      )}
    </>
  );
}

interface SortableGroupRowProps {
  group: CategoryGroupSummary;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedCategories: Set<string>;
  onToggleCategory: (id: string) => void;
  selectedMonth: string;
}

function SortableGroupRow({
  group,
  payees,
  isExpanded,
  onToggleExpand,
  expandedCategories,
  onToggleCategory,
  selectedMonth,
}: SortableGroupRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const groupStatus = getBudgetStatus(group.totalBudgeted, group.totalSpent);
  const groupAvailableColor =
    groupStatus === 'overspent'
      ? 'text-red-500'
      : groupStatus === 'funded'
        ? 'text-green-500'
        : groupStatus === 'underfunded'
          ? 'text-yellow-500'
          : 'text-muted-foreground';

  return (
    <Fragment>
      {/* Group Row */}
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          'bg-muted/60 hover:bg-muted/80 cursor-pointer border-b',
          isDragging && 'bg-muted opacity-50'
        )}
      >
        <td className="py-3 pr-2 pl-1">
          <div className="flex items-center gap-1">
            {/* Drag Handle */}
            <button
              className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab touch-none p-1"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-center gap-1.5" onClick={onToggleExpand}>
              <span className="text-muted-foreground shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
              <span className="truncate font-semibold">{group.name}</span>
            </div>
          </div>
        </td>
        <td className="px-2 py-3" onClick={onToggleExpand}>
          <CategoryProgressBar
            budgeted={group.totalBudgeted}
            spent={group.totalSpent}
            selectedMonth={selectedMonth}
          />
        </td>
        <td className="hidden w-28 px-2 py-3 text-right lg:table-cell" onClick={onToggleExpand}>
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatCurrencyILS(group.totalSpent)}
          </span>
          <span className="text-muted-foreground/40 mx-0.5 text-xs">/</span>
          <span className="text-muted-foreground/60 text-xs tabular-nums">
            {formatCurrencyILS(group.totalBudgeted)}
          </span>
        </td>
        <td className="py-3 pr-3 pl-2 text-right" onClick={onToggleExpand}>
          <span className={cn('font-semibold tabular-nums', groupAvailableColor)}>
            {formatCurrencyILS(group.totalAvailable)}
          </span>
          <div className="text-muted-foreground text-[10px] tabular-nums lg:hidden">
            {formatCurrencyILS(group.totalSpent)}/{formatCurrencyILS(group.totalBudgeted)}
          </div>
        </td>
      </tr>

      {/* Category Rows */}
      {isExpanded &&
        group.categories.map((category) => (
          <CategoryTableRow
            key={category.categoryId}
            category={category}
            payees={payees}
            isExpanded={expandedCategories.has(category.categoryId)}
            onToggleExpand={() => onToggleCategory(category.categoryId)}
            selectedMonth={selectedMonth}
          />
        ))}
    </Fragment>
  );
}

export default function BudgetDashboardPage() {
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();
  const { data: monthSummary, isLoading, error } = useBudgetMonthSummary(selectedMonth);
  const { data: payees = [] } = usePayees();
  const { expandedGroups, toggleGroup, expandAll, collapseAll } = useExpandedGroups();
  const { expandedCategories, toggleCategory } = useExpandedCategories();

  const allGroupIds = useMemo(
    () => monthSummary?.categoryGroups.map((g) => g.id) || [],
    [monthSummary?.categoryGroups]
  );
  const allExpanded = allGroupIds.length > 0 && allGroupIds.every((id) => expandedGroups.has(id));

  // Custom order for groups
  const { order, updateOrder } = useGroupOrder(allGroupIds);

  // Sort groups by custom order
  const orderedGroups = useMemo(() => {
    const groups = monthSummary?.categoryGroups;
    if (!groups) return [];
    const groupsMap = new Map(groups.map((g) => [g.id, g]));
    return order
      .map((id) => groupsMap.get(id))
      .filter((g): g is CategoryGroupSummary => g !== undefined);
  }, [monthSummary, order]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as string);
      const newIndex = order.indexOf(over.id as string);
      updateOrder(arrayMove(order, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Monthly Budget</h1>
          <p className="text-muted-foreground text-sm">Track your spending against your budget</p>
        </div>
        <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-3">
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

      {/* Categories Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Categories</h2>
          <div className="flex gap-2">
            {isLoading && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => (allExpanded ? collapseAll() : expandAll(allGroupIds))}
              disabled={isLoading || !monthSummary}
            >
              {allExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-3">
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-8 animate-pulse rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : orderedGroups.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs">
                      <th className="w-36 py-2.5 pr-2 pl-3 text-left font-medium sm:w-44">
                        Category
                      </th>
                      <th className="px-2 py-2.5 text-left font-medium">Progress</th>
                      <th className="hidden w-28 px-2 py-2.5 text-right font-medium lg:table-cell">
                        Spent/Budget
                      </th>
                      <th className="w-20 py-2.5 pr-3 pl-2 text-right font-medium sm:w-24">
                        Available
                      </th>
                    </tr>
                  </thead>
                  <SortableContext items={order} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {orderedGroups.map((group) => (
                        <SortableGroupRow
                          key={group.id}
                          group={group}
                          payees={payees}
                          isExpanded={expandedGroups.has(group.id)}
                          onToggleExpand={() => toggleGroup(group.id)}
                          expandedCategories={expandedCategories}
                          onToggleCategory={toggleCategory}
                          selectedMonth={selectedMonth}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </DndContext>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <p className="text-muted-foreground">No categories set up yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Create categories to start tracking your budget
                </p>
                <Button variant="outline" className="mt-3" size="sm" asChild>
                  <Link href="/budget/categories">Set Up Categories</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
