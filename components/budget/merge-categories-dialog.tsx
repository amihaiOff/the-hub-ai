'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowRight } from 'lucide-react';
import { useMergeCategory } from '@/lib/hooks/use-budget';
import { type BudgetCategory, formatCurrencyILS } from '@/lib/utils/budget';

interface CategoryGroup {
  id: string;
  name: string;
  categories: BudgetCategory[];
}

interface MergeCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCategory: BudgetCategory | null;
  categoryGroups: CategoryGroup[];
  onComplete: () => void;
}

export function MergeCategoriesDialog({
  open,
  onOpenChange,
  sourceCategory,
  categoryGroups,
  onComplete,
}: MergeCategoriesDialogProps) {
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const mergeCategory = useMergeCategory();

  const targetCategory = categoryGroups
    .flatMap((g) => g.categories)
    .find((c) => c.id === targetCategoryId);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!sourceCategory || !targetCategoryId) return;
      setError(null);

      try {
        await mergeCategory.mutateAsync({
          sourceCategoryId: sourceCategory.id,
          targetCategoryId,
        });
        setTargetCategoryId('');
        onComplete();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to merge categories');
      }
    },
    [sourceCategory, targetCategoryId, mergeCategory, onComplete, onOpenChange]
  );

  const handleClose = () => {
    setTargetCategoryId('');
    onOpenChange(false);
  };

  if (!sourceCategory) return null;

  const sourceBudget = sourceCategory.budget ?? 0;
  const targetBudget = targetCategory?.budget ?? 0;
  const combinedBudget = sourceBudget + targetBudget;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Merge Category</DialogTitle>
            <DialogDescription>
              Merge &quot;{sourceCategory.name}&quot; into another category. All transactions,
              payees, and rules will be moved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Source Category */}
            <div className="grid gap-2">
              <Label>Merge from</Label>
              <div className="bg-muted rounded-md px-3 py-2 text-sm font-medium">
                {sourceCategory.name}
                {sourceBudget > 0 && (
                  <span className="text-muted-foreground ml-2">
                    (budget: {formatCurrencyILS(sourceBudget)})
                  </span>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="text-muted-foreground h-5 w-5" />
            </div>

            {/* Target Category */}
            <div className="grid gap-2">
              <Label htmlFor="target-category">Merge into</Label>
              <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryGroups.map((group) => {
                    const availableCategories = group.categories.filter(
                      (c) => c.id !== sourceCategory.id
                    );
                    if (availableCategories.length === 0) return null;

                    return (
                      <SelectGroup key={group.id}>
                        <SelectLabel>{group.name}</SelectLabel>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                            {cat.budget ? ` (${formatCurrencyILS(cat.budget)})` : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Error */}
            {error && (
              <div className="text-destructive rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm">
                {error}
              </div>
            )}

            {/* Summary */}
            {targetCategory && (
              <div className="bg-muted rounded-lg p-3 text-sm">
                <p>
                  All transactions, payees, and rules from <strong>{sourceCategory.name}</strong>{' '}
                  will be moved to <strong>{targetCategory.name}</strong>.
                </p>
                {combinedBudget > 0 && (
                  <p className="mt-1">
                    Combined budget: <strong>{formatCurrencyILS(combinedBudget)}</strong>
                  </p>
                )}
                <p className="text-muted-foreground mt-1">
                  &quot;{sourceCategory.name}&quot; will be deleted.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mergeCategory.isPending || !targetCategoryId}>
              {mergeCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Merge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
