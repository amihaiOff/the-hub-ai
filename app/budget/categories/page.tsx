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
import { Plus, MoreVertical, Pencil, Trash2, AlertCircle, Loader2, Merge } from 'lucide-react';
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
import { AddCategoryDialog, EditCategoryDialog, AddCategoryGroupDialog } from '@/components/budget';
import { MergeCategoriesDialog } from '@/components/budget/merge-categories-dialog';
import { getGroupChartColor } from '@/lib/utils/category-group-icons';
import {
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from 'recharts';

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Categories</h1>
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
              <div className="lg:border-border lg:bg-card overflow-hidden lg:rounded-lg lg:border lg:py-6">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-2 py-2 text-left text-sm font-medium sm:px-4 sm:py-3">
                          Name
                        </th>
                        <th className="w-16 px-1 py-2 text-center text-sm font-medium sm:w-20 sm:px-2 sm:py-3">
                          Essential
                        </th>
                        <th className="w-24 px-2 py-2 text-right text-sm font-medium sm:w-32 sm:px-4 sm:py-3">
                          Budget
                        </th>
                        <th className="w-8 px-1 py-2 sm:w-10 sm:px-2 sm:py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryGroups.map((group) => (
                        <Fragment key={group.id}>
                          {/* Group Row */}
                          <tr className="bg-muted/30 hover:bg-muted/50 border-b">
                            <td className="px-2 py-3 sm:px-4 sm:py-4">
                              <span className="text-sm font-semibold sm:text-base">
                                {group.name}
                              </span>
                              <span className="text-muted-foreground ml-1 text-xs sm:ml-2 sm:text-sm">
                                ({group.categories.length})
                              </span>
                            </td>
                            <td className="px-1 py-3 sm:px-2 sm:py-4"></td>
                            <td className="px-2 py-3 text-right sm:px-4 sm:py-4">
                              <span className="text-muted-foreground text-sm tabular-nums">
                                {formatCurrencyILS(
                                  group.categories.reduce((sum, cat) => sum + (cat.budget || 0), 0)
                                )}
                              </span>
                            </td>
                            <td className="px-1 py-3 text-right sm:px-2 sm:py-4">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
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

                          {/* Category Rows */}
                          {group.categories.length === 0 ? (
                            <tr key={`empty-${group.id}`} className="border-b">
                              <td colSpan={4} className="px-2 py-2 pl-6 sm:px-4 sm:py-3 sm:pl-8">
                                <p className="text-muted-foreground text-sm italic">
                                  No categories in this group
                                </p>
                              </td>
                            </tr>
                          ) : (
                            group.categories.map((category) => {
                              return (
                                <tr
                                  key={category.id}
                                  className="hover:bg-muted/30 border-b transition-colors"
                                >
                                  {/* Name */}
                                  <td className="px-2 py-2 pl-6 sm:px-4 sm:py-3 sm:pl-8">
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
                                  <td className="px-1 py-2 text-right sm:px-2 sm:py-3">
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
}

function BudgetDistribution({ categoryGroups }: BudgetDistributionProps) {
  const { totalBudget, groupRows, categoryRows } = useMemo(() => {
    const groups: GroupRow[] = categoryGroups
      .map((g, idx) => ({
        id: g.id,
        name: g.name,
        total: g.categories.reduce((sum, c) => sum + (c.budget || 0), 0),
        count: g.categories.length,
        color: getGroupChartColor(g.name, idx),
      }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);
    const total = groups.reduce((sum, g) => sum + g.total, 0);

    const cats: CategoryRow[] = [];
    let fallbackIdx = 0;
    for (const g of categoryGroups) {
      for (const c of g.categories) {
        if ((c.budget || 0) > 0) {
          cats.push({
            id: c.id,
            name: c.name,
            groupName: g.name,
            budget: c.budget || 0,
            color: getGroupChartColor(g.name, fallbackIdx++),
          });
        }
      }
    }
    cats.sort((a, b) => b.budget - a.budget);

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
        <h2 className="text-lg font-semibold">By group</h2>
        <Card>
          <CardContent className="py-4">
            <DistributionBarChart
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

      {/* Category Distribution */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">By category</h2>
        <Card>
          <CardContent className="py-4">
            <DistributionBarChart
              data={categoryRows.map((c) => ({
                name: c.name,
                value: c.budget,
                color: c.color,
                pct: (c.budget / totalBudget) * 100,
              }))}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

interface ChartTooltipPayload {
  payload?: { name?: string; value?: number; pct?: number };
  value?: number;
}

function ChartTooltipCard({
  active,
  payload,
  totalBudget,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  totalBudget?: number;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  const amount = data.value ?? payload[0]?.value ?? 0;
  const pct = data.pct ?? (totalBudget ? (amount / totalBudget) * 100 : 0);
  return (
    <div className="bg-background rounded-lg border p-3 shadow-lg">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground text-sm tabular-nums">{formatCurrencyILS(amount)}</p>
      <p className="text-muted-foreground text-sm tabular-nums">{pct.toFixed(1)}%</p>
    </div>
  );
}

interface DistributionDatum {
  name: string;
  value: number;
  color: string;
  pct: number;
}

function DistributionBarChart({ data }: { data: DistributionDatum[] }) {
  const ROW = 36;
  const TOP_BOTTOM = 48;
  const height = Math.max(160, data.length * ROW + TOP_BOTTOM);
  // Reserve room on the right for the "xx.x%" label that sits beyond the bar.
  const rightMargin = 56;
  // Left margin holds the YAxis tick labels (category/group names).
  const leftMargin = 8;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: rightMargin, bottom: 24, left: leftMargin }}
          barCategoryGap="25%"
        >
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)
            }
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            width={130}
            tick={{ fontSize: 12, fill: '#a1a1aa' }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => (
              <ChartTooltipCard
                active={active}
                payload={payload as ChartTooltipPayload[] | undefined}
              />
            )}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell key={`b-${i}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v) => {
                const n = typeof v === 'number' ? v : Number(v ?? 0);
                return `${n.toFixed(1)}%`;
              }}
              style={{ fill: '#a1a1aa', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
