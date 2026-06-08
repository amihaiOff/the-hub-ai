'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  useApplyRiseupMappings,
} from '@/lib/hooks/use-budget';
import { type BudgetCategory, formatCurrencyILS } from '@/lib/utils/budget';
import { AddCategoryDialog, EditCategoryDialog, AddCategoryGroupDialog } from '@/components/budget';
import { MergeCategoriesDialog } from '@/components/budget/merge-categories-dialog';

export default function CategoriesPage() {
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
  const applyRiseupMappings = useApplyRiseupMappings();

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
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Categories</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => applyRiseupMappings.mutate()}
            disabled={applyRiseupMappings.isPending}
            title="Re-apply Riseup category mappings to existing uncategorized transactions"
          >
            {applyRiseupMappings.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Apply Mappings
          </Button>
          <Button variant="outline" onClick={() => setShowAddGroup(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Group
          </Button>
          <Button variant="outline" onClick={() => setShowAddCategory(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Category
          </Button>
        </div>
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

      {/* Categories Table */}
      {!isLoading && categoryGroups.length === 0 ? (
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
                  <th className="px-2 py-2 text-left text-sm font-medium sm:px-4 sm:py-3">Name</th>
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
                        <span className="text-sm font-semibold sm:text-base">{group.name}</span>
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
                            <DropdownMenuItem onClick={() => handleAddCategoryToGroup(group.id)}>
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
                                  <DropdownMenuItem onClick={() => setEditingCategory(category)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setMergingCategory(category)}>
                                    <Merge className="mr-2 h-4 w-4" />
                                    Merge into...
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteCategory(category.id, category.name)}
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
