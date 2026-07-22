'use client';

import { useState, Fragment, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import { CategoryGroupIcon, getGroupIconColor } from '@/lib/utils/category-group-icons';

// Hook to persist group order in localStorage
function useGroupOrder(groupIds: string[]) {
  const [savedOrder, setSavedOrder] = useState<string[]>(() => {
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

function availableColor(isSavings: boolean, status: ReturnType<typeof getBudgetStatus>): string {
  if (isSavings) return 'text-[#a8caff]';
  if (status === 'overspent') return 'text-[#f5a5a5]';
  if (status === 'funded' || status === 'underfunded') return 'text-[#a8caff]';
  return 'text-muted-foreground';
}

// ─── Mobile card layout ───────────────────────────────────────────────

interface MobileCategoryRowProps {
  category: CategorySpending;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedMonth: string;
  isLast: boolean;
}

function MobileCategoryRow({
  category,
  payees,
  isExpanded,
  onToggleExpand,
  selectedMonth,
  isLast,
}: MobileCategoryRowProps) {
  const isSavings = category.groupName === 'Savings';
  const status = getBudgetStatus(category.budgeted, category.spent);
  const color = availableColor(isSavings, status);
  const displayAvailable = isSavings ? category.spent : category.available;
  const usedPercent = category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
  const usedColor = status === 'overspent' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <div className={cn(!isLast && 'border-border/40 border-b')}>
      <div className="cursor-pointer px-4 py-3 active:bg-[#a8caff]/5" onClick={onToggleExpand}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground/50 shrink-0 text-xs">└</span>
            <span className="truncate text-sm">{category.categoryName}</span>
          </div>
          <span className="shrink-0 text-sm tabular-nums" dir="ltr">
            {/* <bdi> isolates each formatted currency from bidi reordering.
                The ₪ inside formatCurrencyILS is a strong RTL char and
                without isolation it dragged the slash + neighbour number
                into the wrong visual order. */}
            <bdi className={cn('font-medium', color)}>{formatCurrencyILS(displayAvailable)}</bdi>
            <span className="text-muted-foreground/60">
              {' / '}
              <bdi>{formatCurrencyILS(category.budgeted)}</bdi>
            </span>
          </span>
        </div>
        <div className="mt-1.5 pl-4">
          <CategoryProgressBar
            budgeted={category.budgeted}
            spent={category.spent}
            selectedMonth={selectedMonth}
            showStats={false}
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground tabular-nums" dir="ltr">
              Spent: <bdi>{formatCurrencyILS(category.spent)}</bdi>
            </span>
            <span className={cn('font-medium tabular-nums', usedColor)}>
              {usedPercent.toFixed(usedPercent >= 10 ? 0 : 1)}% used
            </span>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="border-border/30 bg-background border-t px-4 pt-2 pb-3">
          <CategoryTransactionsMini transactions={category.transactions} payees={payees} />
        </div>
      )}
    </div>
  );
}

interface MobileGroupCardProps {
  group: CategoryGroupSummary;
  payees: BudgetPayee[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  expandedCategories: Set<string>;
  onToggleCategory: (id: string) => void;
  selectedMonth: string;
}

function MobileGroupCard({
  group,
  payees,
  isExpanded,
  onToggleExpand,
  expandedCategories,
  onToggleCategory,
  selectedMonth,
}: MobileGroupCardProps) {
  const isGroupSavings = group.name === 'Savings';
  const groupStatus = getBudgetStatus(group.totalBudgeted, group.totalSpent);
  const leftColor = availableColor(isGroupSavings, groupStatus);
  const groupDisplayAvailable = isGroupSavings ? group.totalSpent : group.totalAvailable;
  const iconColor = getGroupIconColor(group.name);
  const usedPercent = group.totalBudgeted > 0 ? (group.totalSpent / group.totalBudgeted) * 100 : 0;
  const usedColor = groupStatus === 'overspent' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      {/* Group header — full-card tap target */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="active:bg-muted/40 flex w-full flex-col gap-3 p-4 text-left transition-colors"
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
          <span className="flex-1 truncate text-xl font-bold">{group.name}</span>
          <div className="shrink-0 text-right">
            <div className={cn('text-base font-semibold tabular-nums', leftColor)} dir="ltr">
              <bdi>{formatCurrencyILS(groupDisplayAvailable)}</bdi>{' '}
              <span className="text-muted-foreground text-xs font-normal">left</span>
            </div>
            <div className="text-muted-foreground text-xs tabular-nums" dir="ltr">
              of <bdi>{formatCurrencyILS(group.totalBudgeted)}</bdi>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <CategoryProgressBar
          budgeted={group.totalBudgeted}
          spent={group.totalSpent}
          selectedMonth={selectedMonth}
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

      {/* Expanded categories */}
      {isExpanded && group.categories.length > 0 && (
        <div className="border-border/50 border-t">
          {group.categories.map((category, i) => (
            <MobileCategoryRow
              key={category.categoryId}
              category={category}
              payees={payees}
              isExpanded={expandedCategories.has(category.categoryId)}
              onToggleExpand={() => onToggleCategory(category.categoryId)}
              selectedMonth={selectedMonth}
              isLast={i === group.categories.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Desktop table layout (with DnD) ─────────────────────────────────

interface CategoryTableRowProps {
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
}: CategoryTableRowProps) {
  const isSavings = category.groupName === 'Savings';
  const status = getBudgetStatus(category.budgeted, category.spent);
  const color = availableColor(isSavings, status);
  const displayAvailable = isSavings ? category.spent : category.available;

  return (
    <>
      <tr
        className="cursor-pointer border-b transition-colors duration-200 hover:bg-[#a8caff]/5"
        onClick={onToggleExpand}
      >
        <td className="py-2.5 pr-2 pl-8 sm:w-44">
          <span className="truncate text-sm">{category.categoryName}</span>
        </td>
        <td className="px-2 py-2.5">
          <CategoryProgressBar
            budgeted={category.budgeted}
            spent={category.spent}
            selectedMonth={selectedMonth}
            showStats={false}
          />
        </td>
        <td className="py-2.5 pr-3 pl-2 text-right">
          <span className="text-sm whitespace-nowrap tabular-nums" dir="ltr">
            <bdi className={cn('font-medium', color)}>{formatCurrencyILS(displayAvailable)}</bdi>
            <span className="text-muted-foreground/60">
              {' / '}
              <bdi>{formatCurrencyILS(category.budgeted)}</bdi>
            </span>
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b">
          <td colSpan={3} className="bg-background px-4 py-2.5 pl-12">
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

  const isGroupSavings = group.name === 'Savings';
  const groupStatus = getBudgetStatus(group.totalBudgeted, group.totalSpent);
  const color = availableColor(isGroupSavings, groupStatus);
  const groupDisplayAvailable = isGroupSavings ? group.totalSpent : group.totalAvailable;
  const iconColor = getGroupIconColor(group.name);
  const subtitle =
    group.categories.length > 0
      ? group.categories
          .slice(0, 3)
          .map((c) => c.categoryName)
          .join(', ') + (group.categories.length > 3 ? '…' : '')
      : null;
  const remainingPct =
    group.totalBudgeted > 0
      ? Math.max(0, ((group.totalBudgeted - group.totalSpent) / group.totalBudgeted) * 100)
      : 0;
  const availableLabel =
    groupStatus === 'overspent'
      ? 'Critical Alert'
      : `${remainingPct.toFixed(remainingPct >= 10 ? 0 : 1)}% Remaining`;

  return (
    <Fragment>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onToggleExpand}
        className={cn(
          'bg-secondary hover:bg-secondary/80 cursor-grab border-b transition-colors duration-200 active:cursor-grabbing',
          isDragging && 'opacity-50'
        )}
      >
        <td className="py-3 pr-2 pl-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                iconColor
              )}
            >
              <CategoryGroupIcon groupName={group.name} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{group.name}</div>
              {subtitle && <div className="text-muted-foreground truncate text-xs">{subtitle}</div>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <CategoryProgressBar
            budgeted={group.totalBudgeted}
            spent={group.totalSpent}
            selectedMonth={selectedMonth}
            showStats={false}
            showDateIndicator={false}
          />
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className="text-foreground tabular-nums" dir="ltr">
              <bdi>{formatCurrencyILS(group.totalSpent)}</bdi> spent
            </span>
            <span className="text-muted-foreground tabular-nums" dir="ltr">
              Goal: <bdi>{formatCurrencyILS(group.totalBudgeted)}</bdi>
            </span>
          </div>
        </td>
        <td className="py-3 pr-3 pl-2 text-right">
          <div className={cn('font-semibold whitespace-nowrap tabular-nums', color)} dir="ltr">
            <bdi>{formatCurrencyILS(groupDisplayAvailable)}</bdi>
          </div>
          <div
            className={cn(
              'mt-0.5 text-xs',
              groupStatus === 'overspent' ? 'text-red-500' : 'text-muted-foreground'
            )}
          >
            {availableLabel}
          </div>
        </td>
      </tr>

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

// ─── Page ─────────────────────────────────────────────────────────────

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

  const { order, updateOrder } = useGroupOrder(allGroupIds);

  const orderedGroups = useMemo(() => {
    const groups = monthSummary?.categoryGroups;
    if (!groups) return [];
    const groupsMap = new Map(groups.map((g) => [g.id, g]));
    return order
      .map((id) => groupsMap.get(id))
      .filter((g): g is CategoryGroupSummary => g !== undefined);
  }, [monthSummary, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
      <div className="flex items-center justify-between">
        <h1 className="page-title text-5xl font-bold tracking-tight lg:text-6xl">Monthly Budget</h1>
        <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
      </div>

      {/* Error */}
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

      {/* Categories */}
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
          <div className="space-y-2 py-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : orderedGroups.length > 0 ? (
          <>
            {/* Mobile: card-based layout */}
            <div className="space-y-2 sm:hidden">
              {orderedGroups.map((group) => (
                <MobileGroupCard
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
            </div>

            {/* Desktop: table with DnD */}
            <div className="hidden sm:block">
              <div className="border-border bg-card overflow-hidden rounded-lg border">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <table className="w-full">
                    <thead>
                      <tr className="bg-secondary text-muted-foreground border-b text-xs tracking-wider uppercase">
                        <th className="w-72 py-2.5 pr-2 pl-3 text-left font-medium">Category</th>
                        <th className="px-4 py-2.5 text-left font-medium">Spent</th>
                        <th className="w-32 py-2.5 pr-3 pl-2 text-right font-medium">Available</th>
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
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">No categories set up yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Create categories to start tracking your budget
            </p>
            <Button variant="outline" className="mt-3" size="sm" asChild>
              <Link href="/budget/categories">Set Up Categories</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
