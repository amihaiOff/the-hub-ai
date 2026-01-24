'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Pencil, Trash2, Star, AlertCircle, Loader2 } from 'lucide-react';
import {
  useCategoryGroups,
  useDeleteCategory,
  useDeleteCategoryGroup,
} from '@/lib/hooks/use-budget';
import { type BudgetCategory, formatCurrencyILS } from '@/lib/utils/budget';
import { AddCategoryDialog, EditCategoryDialog, AddCategoryGroupDialog } from '@/components/budget';

export default function CategoriesPage() {
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [defaultGroupId, setDefaultGroupId] = useState<string>('');

  const { data: categoryGroups = [], isLoading, error } = useCategoryGroups();
  const deleteCategory = useDeleteCategory();
  const deleteCategoryGroup = useDeleteCategoryGroup();

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
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Categories</h1>
          <p className="text-muted-foreground text-sm">
            Organize your spending into categories and groups
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddGroup(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Group
          </Button>
          <Button onClick={() => setShowAddCategory(true)}>
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
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-muted-foreground">No category groups yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Create a group to start organizing your categories
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setShowAddGroup(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Your First Group
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                  <th className="hidden px-4 py-3 text-right text-sm font-medium sm:table-cell">
                    Budget
                  </th>
                  <th className="w-20 px-4 py-3 text-right text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categoryGroups.map((group) => (
                  <>
                    {/* Group Row - Highlighted and larger */}
                    <tr
                      key={`group-${group.id}`}
                      className="bg-muted/30 hover:bg-muted/50 border-b"
                    >
                      <td className="px-4 py-4">
                        <span className="text-base font-semibold">{group.name}</span>
                        <span className="text-muted-foreground ml-2 text-sm">
                          ({group.categories.length}{' '}
                          {group.categories.length === 1 ? 'category' : 'categories'})
                        </span>
                      </td>
                      <td className="hidden px-4 py-4 text-right sm:table-cell">
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {formatCurrencyILS(
                            group.categories.reduce((sum, cat) => sum + (cat.budget || 0), 0)
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => handleAddCategoryToGroup(group.id)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Add</span>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleDeleteGroup(group.id, group.name)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Group
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>

                    {/* Category Rows */}
                    {group.categories.length === 0 ? (
                      <tr key={`empty-${group.id}`} className="border-b">
                        <td colSpan={3} className="px-4 py-3 pl-8">
                          <p className="text-muted-foreground text-sm italic">
                            No categories in this group
                          </p>
                        </td>
                      </tr>
                    ) : (
                      group.categories.map((category) => (
                        <tr
                          key={category.id}
                          className="hover:bg-muted/30 border-b transition-colors"
                        >
                          <td className="px-4 py-3 pl-8">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{category.name}</span>
                              {category.isMust && (
                                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                              )}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 text-right sm:table-cell">
                            {category.budget ? (
                              <span className="text-muted-foreground text-sm tabular-nums">
                                {formatCurrencyILS(category.budget)}/mo
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditingCategory(category)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
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
                      ))
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
    </div>
  );
}
