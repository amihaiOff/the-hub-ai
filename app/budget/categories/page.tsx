'use client';

import { useState, useRef, useEffect, Fragment, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  Merge,
  Percent,
  ChevronDown,
} from 'lucide-react';
import {
  useCategoryGroups,
  useDeleteCategory,
  useDeleteCategoryGroup,
  useUpdateCategory,
} from '@/lib/hooks/use-budget';
import {
  type BudgetCategory,
  type BudgetCategoryGroup,
  formatCurrencyILS,
} from '@/lib/utils/budget';
import { cn } from '@/lib/utils';
import { AddCategoryDialog, EditCategoryDialog, AddCategoryGroupDialog } from '@/components/budget';
import { MergeCategoriesDialog } from '@/components/budget/merge-categories-dialog';
import { getGroupChartColor } from '@/lib/utils/category-group-icons';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';

const DistributionBarChart = dynamic(
  () => import('@/components/budget/distribution-bar-chart').then((m) => m.DistributionBarChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> }
);

export default function CategoriesPage() {
  const [activeTab, setActiveTab] = useState('categories');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [mergingCategory, setMergingCategory] = useState<BudgetCategory | null>(null);
  const [defaultGroupId, setDefaultGroupId] = useState<string>('');

  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState('');
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const { data: categoryGroups = [], isLoading, error } = useCategoryGroups();
  const deleteCategory = useDeleteCategory();
  const deleteCategoryGroup = useDeleteCategoryGroup();
  const updateCategory = useUpdateCategory();

  useEffect(() => {
    if (editingBudgetId && budgetInputRef.current) {
      budgetInputRef.current.focus();
      budgetInputRef.current.select();
    }
  }, [editingBudgetId]);

  const handleBudgetSave = (categoryId: string) => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const value = editingBudgetValue.trim();
    const budget = value === '' ? null : Number(value);
    if (budget !== null && (isNaN(budget) || budget < 0)) {
      setEditingBudgetId(null);
      return;
    }
    updateCategory.mutate({ id: categoryId, budget });
    setEditingBudgetId(null);
  };

  const handleToggleEssential = (categoryId: string, currentValue: boolean) => {
    updateCategory.mutate({ id: categoryId, isMust: !currentValue });
  };

  const handleAddCategoryToGroup = (groupId: string) => {
    setDefaultGroupId(groupId);
    setShowAddCategory(true);
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    if (confirm(`Delete category "${categoryName}"? Transactions will be uncategorized.`)) {
      try {
        await deleteCategory.mutateAsync(categoryId);
      } catch (error) {
        console.error('Failed to delete category:', error);
      }
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (
      confirm(
        `Delete group "${groupName}" and all its categories? Transactions will be uncategorized.`
      )
    ) {
      try {
        await deleteCategoryGroup.mutateAsync(groupId);
      } catch (error) {
        console.error('Failed to delete category group:', error);
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title text-4xl font-bold tracking-tight">Categories</h1>
        {activeTab === 'categories' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAddGroup(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Group
            </Button>
            <Button variant="outline" onClick={() => setShowAddCategory(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Category
            </Button>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load categories</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {!isLoading && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="space-y-4">
            {categoryGroups.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No category groups yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Create a group to start organizing your categories
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setShowAddGroup(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Your First Group
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate [border-spacing:0_0.5rem]">
                  <thead>
                    <tr>
                      <th className="text-muted-foreground px-2 pb-1 text-left text-xs font-medium tracking-wider uppercase sm:px-4">
                        Name
                      </th>
                      <th className="text-muted-foreground w-16 px-1 pb-1 text-center text-xs font-medium tracking-wider uppercase sm:w-20 sm:px-2">
                        Essential
                      </th>
                      <th className="text-muted-foreground w-24 px-2 pb-1 text-right text-xs font-medium tracking-wider uppercase sm:w-32 sm:px-4">
                        Budget
                      </th>
                      <th className="w-8 pb-1 sm:w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryGroups.map((group, groupIdx) => (
                      <Fragment key={group.id}>
                        {/* Group Header Row — non-card, hairline separator above (except first) */}
                        <tr>
                          <td
                            colSpan={2}
                            className={cn(
                              'px-2 pt-4 pb-1 sm:px-4',
                              groupIdx > 0 && 'border-border/40 border-t'
                            )}
                          >
                            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                              {group.name}
                            </span>
                            <span className="text-muted-foreground/70 ml-2 text-xs">
                              ({group.categories.length})
                            </span>
                          </td>
                          <td
                            className={cn(
                              'px-2 pt-4 pb-1 text-right sm:px-4',
                              groupIdx > 0 && 'border-border/40 border-t'
                            )}
                          >
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatCurrencyILS(
                                group.categories.reduce((sum, cat) => sum + (cat.budget || 0), 0)
                              )}
                            </span>
                          </td>
                          <td
                            className={cn(
                              'px-1 pt-4 pb-1 text-right sm:px-2',
                              groupIdx > 0 && 'border-border/40 border-t'
                            )}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleAddCategoryToGroup(group.id)}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add Category
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteGroup(group.id, group.name)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Group
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>

                        {/* Category Rows — subtle card style with rounded outer corners */}
                        {group.categories.length === 0 ? (
                          <tr key={`empty-${group.id}`}>
                            <td
                              colSpan={4}
                              className="bg-muted/20 text-muted-foreground rounded-2xl px-4 py-2 text-sm italic sm:px-6"
                            >
                              No categories in this group
                            </td>
                          </tr>
                        ) : (
                          group.categories.map((category) => {
                            return (
                              <tr
                                key={category.id}
                                className="[&>td]:bg-muted/35 hover:[&>td]:bg-muted/55 [&>td]:transition-colors"
                              >
                                {/* Name */}
                                <td className="rounded-l-2xl px-2 py-2 sm:px-4 sm:py-3">
                                  <span className="text-sm font-medium">{category.name}</span>
                                </td>

                                {/* Essential */}
                                <td className="px-1 py-2 text-center sm:px-2 sm:py-3">
                                  <Checkbox
                                    checked={category.isMust}
                                    onCheckedChange={() =>
                                      handleToggleEssential(category.id, category.isMust)
                                    }
                                    className="border-muted-foreground"
                                  />
                                </td>

                                {/* Budget */}
                                <td
                                  className="w-24 px-2 py-2 text-right sm:w-32 sm:px-4 sm:py-3"
                                  onClick={() => {
                                    if (editingBudgetId !== category.id) {
                                      setEditingBudgetId(category.id);
                                      setEditingBudgetValue(
                                        category.budget ? String(category.budget) : ''
                                      );
                                    }
                                  }}
                                >
                                  {editingBudgetId === category.id ? (
                                    <input
                                      ref={budgetInputRef}
                                      type="number"
                                      value={editingBudgetValue}
                                      onChange={(e) => setEditingBudgetValue(e.target.value)}
                                      onBlur={() => handleBudgetSave(category.id)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                        if (e.key === 'Escape') {
                                          cancelledRef.current = true;
                                          setEditingBudgetId(null);
                                        }
                                      }}
                                      className="w-full [appearance:textfield] bg-transparent text-right text-sm tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  ) : category.budget ? (
                                    <span className="text-muted-foreground cursor-pointer text-sm tabular-nums hover:underline">
                                      {formatCurrencyILS(category.budget)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/50 cursor-pointer text-sm hover:underline">
                                      —
                                    </span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="rounded-r-2xl px-1 py-2 text-right sm:px-2 sm:py-3">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => setEditingCategory(category)}
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => setMergingCategory(category)}
                                      >
                                        <Merge className="mr-2 h-4 w-4" />
                                        Merge into...
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleDeleteCategory(category.id, category.name)
                                        }
                                        className="text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="distribution" className="space-y-6">
            <BudgetDistribution categoryGroups={categoryGroups} />
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogs */}
      <AddCategoryDialog
        open={showAddCategory}
        onOpenChange={(open) => {
          setShowAddCategory(open);
          if (!open) setDefaultGroupId('');
        }}
        defaultGroupId={defaultGroupId}
      />
      <AddCategoryGroupDialog open={showAddGroup} onOpenChange={setShowAddGroup} />
      <EditCategoryDialog
        category={editingCategory}
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
      />
      <MergeCategoriesDialog
        open={!!mergingCategory}
        onOpenChange={(open) => !open && setMergingCategory(null)}
        sourceCategory={mergingCategory}
        categoryGroups={categoryGroups}
        onComplete={() => setMergingCategory(null)}
      />
    </div>
  );
}

interface BudgetDistributionProps {
  categoryGroups: BudgetCategoryGroup[];
}

interface GroupRow {
  id: string;
  name: string;
  total: number;
  count: number;
  color: string;
}

interface CategoryRow {
  id: string;
  name: string;
  groupName: string;
  budget: number;
  color: string;
  isGroupStart: boolean;
}

type ChartMode = 'pct' | 'value';

function BudgetDistribution({ categoryGroups }: BudgetDistributionProps) {
  // Each chart independently toggles between percent and absolute readouts.
  const [groupMode, setGroupMode] = useState<ChartMode>('pct');
  const [catMode, setCatMode] = useState<ChartMode>('pct');
  const { totalBudget, groupRows, categoryRows } = useMemo(() => {
    const groups: GroupRow[] = categoryGroups
      .map((g, idx) => ({
        id: g.id,
        name: g.name,
        total: g.categories.reduce((sum, c) => sum + (c.budget || 0), 0),
        count: g.categories.length,
        // One stable colour per group (by group index) so every category in a
        // group shares it — the category chart then reads as coloured bands.
        color: getGroupChartColor(g.name, idx),
      }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);
    const total = groups.reduce((sum, g) => sum + g.total, 0);

    // Categories sorted BY GROUP (groups in the same order as the group chart —
    // largest first), then by budget within each group. The first category of
    // each group is flagged so the chart can print a subtle group heading.
    const byId = new Map(categoryGroups.map((g) => [g.id, g]));
    const cats: CategoryRow[] = [];
    for (const g of groups) {
      const src = byId.get(g.id);
      if (!src) continue;
      const groupCats = src.categories
        .filter((c) => (c.budget || 0) > 0)
        .sort((a, b) => (b.budget || 0) - (a.budget || 0));
      groupCats.forEach((c, i) => {
        cats.push({
          id: c.id,
          name: c.name,
          groupName: g.name,
          budget: c.budget || 0,
          color: g.color,
          isGroupStart: i === 0,
        });
      });
    }

    return { totalBudget: total, groupRows: groups, categoryRows: cats };
  }, [categoryGroups]);

  if (totalBudget === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">No budgets set</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Set a budget on at least one category to see the distribution.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total budget */}
      <Card>
        <CardContent className="flex flex-col gap-1 py-6">
          <span className="text-muted-foreground text-sm">Total monthly budget</span>
          <span className="text-3xl font-bold tabular-nums lg:text-4xl">
            {formatCurrencyILS(totalBudget)}
          </span>
          <span className="text-muted-foreground text-xs">
            Across {groupRows.length} {groupRows.length === 1 ? 'group' : 'groups'} ·{' '}
            {categoryRows.length} {categoryRows.length === 1 ? 'category' : 'categories'} budgeted
          </span>
        </CardContent>
      </Card>

      {/* Group Distribution */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">By group</h2>
          <ChartModeToggle mode={groupMode} onChange={setGroupMode} />
        </div>
        <Card>
          <CardContent className="py-4">
            <DistributionBarChart
              mode={groupMode}
              data={groupRows.map((g) => ({
                name: g.name,
                value: g.total,
                color: g.color,
                pct: (g.total / totalBudget) * 100,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      {/* Category Distribution — one collapsible card per group, with
          category rows (name · mini bar · %) tucked inside. Bar length
          is share of the GROUP; the trailing % is share of the whole
          budget. Same ChartModeToggle drives whether the trailing
          readout is % or ₪. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">By category</h2>
          <ChartModeToggle mode={catMode} onChange={setCatMode} />
        </div>
        <GroupedCategoryDistribution
          totalBudget={totalBudget}
          groupRows={groupRows}
          categoryRows={categoryRows}
          mode={catMode}
        />
      </section>
    </div>
  );
}

/**
 * Card-per-group layout for the by-category distribution. Each group is
 * a collapsible card: header (colour dot · name · group total) is a
 * click target; expanded body renders one row per category with a mini
 * bar sized to the category's share of THAT GROUP (so the largest
 * category in each group visually anchors the group), plus a trailing
 * % or ₪ figure driven by the top-level mode toggle.
 *
 * All groups start expanded; the state is per-group so collapsing one
 * doesn't drag the others with it.
 */
function GroupedCategoryDistribution({
  totalBudget,
  groupRows,
  categoryRows,
  mode,
}: {
  totalBudget: number;
  groupRows: GroupRow[];
  categoryRows: CategoryRow[];
  mode: ChartMode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Categories bucketed by group name for O(N) rendering.
  const byGroup = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const c of categoryRows) {
      const list = map.get(c.groupName);
      if (list) list.push(c);
      else map.set(c.groupName, [c]);
    }
    return map;
  }, [categoryRows]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groupRows.map((group) => {
        const cats = byGroup.get(group.name) ?? [];
        const groupPct = totalBudget > 0 ? (group.total / totalBudget) * 100 : 0;
        const isCollapsed = collapsed.has(group.id);
        return (
          <Card key={group.id} className="overflow-hidden">
            {/* Header is a click-target only on mobile — desktop is
                always-expanded and the chevron is hidden. `lg:pointer-
                events-none` + `lg:hover:bg-transparent` short-circuits
                the interaction at the ≥lg breakpoint without duplicating
                the JSX. */}
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={!isCollapsed}
              className="hover:bg-muted/30 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors lg:pointer-events-none lg:hover:bg-transparent"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</span>
              <span className="text-base font-bold tabular-nums">
                {mode === 'pct' ? `${groupPct.toFixed(1)}%` : formatCurrencyILS(group.total)}
              </span>
              <ChevronDown
                className={cn(
                  'text-muted-foreground h-4 w-4 shrink-0 transition-transform lg:hidden',
                  isCollapsed && '-rotate-90'
                )}
                aria-hidden
              />
            </button>
            {/* Body hidden below lg when collapsed; always visible at lg+. */}
            <div className={cn(isCollapsed && 'hidden lg:block')}>
              <CardContent className="space-y-2 border-t px-4 pt-3 pb-4">
                {cats.length === 0 ? (
                  <p className="text-muted-foreground text-xs italic">
                    No budgeted categories in this group.
                  </p>
                ) : (
                  cats.map((c) => {
                    const shareOfGroup = group.total > 0 ? (c.budget / group.total) * 100 : 0;
                    const shareOfTotal = totalBudget > 0 ? (c.budget / totalBudget) * 100 : 0;
                    const readout =
                      mode === 'pct' ? `${shareOfTotal.toFixed(1)}%` : formatCurrencyILS(c.budget);
                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="text-muted-foreground w-28 shrink-0 truncate text-xs">
                          {c.name}
                        </span>
                        <div className="bg-muted/40 h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full transition-[width] duration-200"
                            style={{
                              width: `${Math.max(2, shareOfGroup)}%`,
                              backgroundColor: c.color,
                            }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                          {readout}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Segmented control to switch a distribution chart between percentage and
 * absolute (shekel) readouts. Percent uses the lucide Percent glyph; shekel
 * uses the ₪ character (lucide has no shekel icon).
 */
function ChartModeToggle({
  mode,
  onChange,
}: {
  mode: ChartMode;
  onChange: (m: ChartMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Chart readout"
      className="border-border/60 inline-flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-label="Show percentages"
        aria-checked={mode === 'pct'}
        title="Percent"
        onClick={() => onChange('pct')}
        className={cn(
          'flex min-h-9 min-w-11 items-center justify-center rounded-md text-xs transition-colors',
          mode === 'pct'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Percent className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        role="radio"
        aria-label="Show amounts in shekels"
        aria-checked={mode === 'value'}
        title="Shekels"
        onClick={() => onChange('value')}
        className={cn(
          'flex min-h-9 min-w-11 items-center justify-center rounded-md text-sm leading-none font-semibold transition-colors',
          mode === 'value'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        ₪
      </button>
    </div>
  );
}
