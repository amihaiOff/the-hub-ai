'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import {
  useShoppingCategories,
  useCreateShoppingItem,
  useCreateShoppingCategory,
} from '@/lib/hooks/use-shopping';

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
}

export function CreateItemDialog({ open, onOpenChange, defaultName = '' }: CreateItemDialogProps) {
  const [name, setName] = useState(defaultName);
  const [categoryId, setCategoryId] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useShoppingCategories();
  const createItem = useCreateShoppingItem();
  const createCategory = useCreateShoppingCategory();

  const resetForm = () => {
    setName('');
    setCategoryId('');
    setShowNewCategory(false);
    setNewCategoryName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      let resolvedCategoryId = categoryId;

      // Create new category first if needed
      if (showNewCategory && newCategoryName.trim()) {
        const newCategory = await createCategory.mutateAsync({ name: newCategoryName.trim() });
        resolvedCategoryId = newCategory.id;
      }

      if (!name.trim() || !resolvedCategoryId) return;

      await createItem.mutateAsync({
        name: name.trim(),
        categoryId: resolvedCategoryId,
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    }
  };

  const isPending = createItem.isPending || createCategory.isPending;
  const canSubmit =
    name.trim().length > 0 &&
    (categoryId || (showNewCategory && newCategoryName.trim().length > 0));

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setName(defaultName);
          setError(null);
        } else {
          resetForm();
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Item</DialogTitle>
            <DialogDescription>Add a new item to your shopping list library.</DialogDescription>
          </DialogHeader>

          {error && (
            <div className="text-destructive mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm">
              {error}
            </div>
          )}

          <div className="grid gap-4 py-4">
            {/* Item name */}
            <div className="grid gap-2">
              <Label htmlFor="item-name">Item Name</Label>
              <Input
                id="item-name"
                placeholder="e.g. Milk"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Category select */}
            {!showNewCategory && (
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setShowNewCategory(true);
                    setCategoryId('');
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Category
                </Button>
              </div>
            )}

            {/* New category inline input */}
            {showNewCategory && (
              <div className="grid gap-2">
                <Label htmlFor="new-category">New Category</Label>
                <Input
                  id="new-category"
                  placeholder="e.g. Dairy"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName('');
                  }}
                >
                  Use existing category
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
