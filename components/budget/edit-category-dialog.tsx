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
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useUpdateCategory } from '@/lib/hooks/use-budget';
import { type BudgetCategory } from '@/lib/utils/budget';

interface EditCategoryDialogProps {
  category: BudgetCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner component that receives category as required prop
function EditCategoryForm({
  category,
  onOpenChange,
}: {
  category: BudgetCategory;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(category.name);
  const [budget, setBudget] = useState(category.budget?.toString() || '');
  const [isMust, setIsMust] = useState(category.isMust);

  const updateCategory = useUpdateCategory();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const budgetNum = budget ? parseFloat(budget) : null;

    await updateCategory.mutateAsync({
      id: category.id,
      name: name.trim(),
      budget: budgetNum,
      isMust,
    });

    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Category</DialogTitle>
        <DialogDescription>Update the category details.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Name */}
        <div className="grid gap-2">
          <Label htmlFor="edit-cat-name">Category Name</Label>
          <Input
            id="edit-cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Monthly Budget */}
        <div className="grid gap-2">
          <Label htmlFor="edit-cat-budget">Monthly Budget (₪)</Label>
          <Input
            id="edit-cat-budget"
            type="number"
            step="1"
            min="0"
            placeholder="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">Leave empty for no specific budget</p>
        </div>

        {/* Must Category */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="edit-cat-must">Essential Category</Label>
            <p className="text-muted-foreground text-xs">Mark as a must-have expense</p>
          </div>
          <Switch id="edit-cat-must" checked={isMust} onCheckedChange={setIsMust} />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateCategory.isPending || !name.trim()}>
          {updateCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditCategoryDialog({ category, open, onOpenChange }: EditCategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {category && (
          <EditCategoryForm key={category.id} category={category} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}
