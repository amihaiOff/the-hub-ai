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

      {/* Category Distribution */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">By category</h2>
          <ChartModeToggle mode={catMode} onChange={setCatMode} />
        </div>
        <Card>
          <CardContent className="py-4">
            <DistributionBarChart
              mode={catMode}
              grouped
              data={categoryRows.map((c) => ({
                name: c.name,
                value: c.budget,
                color: c.color,
                pct: (c.budget / totalBudget) * 100,
                groupName: c.groupName,
                isGroupStart: c.isGroupStart,
              }))}
            />
          </CardContent>
        </Card>
      </section>
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
  groupName?: string;
  isGroupStart?: boolean;
}

/** Compact shekel amount for axis ticks / bar-end labels (₪1.2k, ₪320). */
function fmtCompactShekel(v: number): string {
  return v >= 1000 ? `₪${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₪${Math.round(v)}`;
}

/** Approximate row height used by the bar chart. Must stay in sync with the
 * `ROW` constant in `DistributionBarChart`. */
const GROUP_ROW = 40;
/** Fixed width for the wrapped group label. */
const GROUP_LABEL_WIDTH = 110;
/** Right edge of the group label column (relative to the tick origin). Sits
 * well to the left of the category names so long names never overlap. */
const GROUP_LABEL_RIGHT = -120;

/**
 * Custom Y-axis tick for the grouped (by-category) chart. Renders the
 * category name at the tick's own y-position and, on the first row of
 * each group, ALSO renders that group's label + a subtle vertical
 * bracket spanning every row in the group. The bracket lets the eye
 * connect each category to its group without a big shouty header.
 */
function GroupedYTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string; index?: number };
  data: DistributionDatum[];
}) {
  const { x = 0, y = 0, payload, data } = props;
  const idx = payload?.index ?? -1;
  const datum = idx >= 0 ? data[idx] : undefined;

  // How many consecutive rows share this group — determines the bracket
  // height. Computed by walking forward until the group changes.
  let groupRows = 0;
  if (datum?.isGroupStart) {
    const g = datum.groupName;
    for (let i = idx; i < data.length; i++) {
      if (data[i]?.groupName === g) groupRows++;
      else break;
    }
  }

  // Total vertical span of the group (in tick-local coords). Label sits
  // centred inside a foreignObject sized to this span so wrapping happens
  // in HTML land — SVG <text> can't wrap on its own.
  const spanTop = -GROUP_ROW / 2;
  const spanHeight = groupRows * GROUP_ROW;

  return (
    <g transform={`translate(${x},${y})`}>
      {datum?.isGroupStart && datum.groupName && (
        <foreignObject
          x={GROUP_LABEL_RIGHT - GROUP_LABEL_WIDTH}
          y={spanTop}
          width={GROUP_LABEL_WIDTH}
          height={spanHeight}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              color: 'var(--muted-foreground)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              lineHeight: 1.25,
              textTransform: 'uppercase',
              textAlign: 'right',
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            }}
          >
            {datum.groupName}
          </div>
        </foreignObject>
      )}
      <text x={0} y={0} dy={4} textAnchor="end" fontSize={12} fill="var(--foreground)">
        {payload?.value ?? ''}
      </text>
    </g>
  );
}

function DistributionBarChart({
  data,
  mode,
  grouped = false,
}: {
  data: DistributionDatum[];
  mode: ChartMode;
  grouped?: boolean;
}) {
  const ROW = grouped ? 40 : 36;
  const TOP_BOTTOM = 48;
  const height = Math.max(160, data.length * ROW + TOP_BOTTOM);
  // Absolute (shekel) labels are wider than "xx.x%", so reserve more room.
  const rightMargin = mode === 'value' ? 64 : 56;
  // Left margin holds the YAxis tick labels (category/group names).
  const leftMargin = 8;

  // The bar width and the readouts both follow the selected mode: percentages
  // (0–100) or absolute shekels. Proportions are identical either way — only
  // the numbers on the axis and bar ends change.
  const dataKey = mode === 'pct' ? 'pct' : 'value';
  const xTickFormatter =
    mode === 'pct'
      ? (v: number) => `${Math.round(v)}%`
      : (v: number) =>
          v >= 1000 ? `₪${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₪${Math.round(v)}`;
  const labelFormatter = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v ?? 0);
    return mode === 'pct' ? `${n.toFixed(1)}%` : fmtCompactShekel(n);
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: grouped ? 20 : 8, right: rightMargin, bottom: 24, left: leftMargin }}
          barCategoryGap="25%"
        >
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickFormatter={xTickFormatter}
          />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            // Widened to hold the group label column drawn to the left of
            // each category name (see GroupedYTick). In the flat
            // (non-grouped) mode the extra space just sits empty.
            width={grouped ? 250 : 130}
            // Render every tick so a group's first-category heading is never
            // thinned away by Recharts' overlap avoidance.
            interval={0}
            tick={
              grouped
                ? (tickProps) => <GroupedYTick {...tickProps} data={data} />
                : { fontSize: 12, fill: '#a1a1aa' }
            }
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
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell key={`b-${i}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey={dataKey}
              position="right"
              formatter={labelFormatter}
              style={{ fill: '#a1a1aa', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
