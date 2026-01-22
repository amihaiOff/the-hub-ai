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
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useCreateCategory, useCategoryGroups } from '@/lib/hooks/use-budget';

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGroupId?: string;
}

export function AddCategoryDialog({ open, onOpenChange, defaultGroupId }: AddCategoryDialogProps) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId || '');
  const [budget, setBudget] = useState('');
  const [isMust, setIsMust] = useState(false);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const createCategory = useCreateCategory();

  const resetForm = () => {
    setName('');
    setGroupId(defaultGroupId || '');
    setBudget('');
    setIsMust(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !groupId) return;

    const budgetNum = budget ? parseFloat(budget) : null;

    await createCategory.mutateAsync({
      name: name.trim(),
      groupId,
      budget: budgetNum,
      isMust,
    });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>Create a new budget category.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Category Name</Label>
              <Input
                id="cat-name"
                placeholder="e.g., Groceries"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Group */}
            <div className="grid gap-2">
              <Label htmlFor="cat-group">Category Group</Label>
              <Select value={groupId} onValueChange={setGroupId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {categoryGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monthly Budget */}
            <div className="grid gap-2">
              <Label htmlFor="cat-budget">Monthly Budget (₪)</Label>
              <Input
                id="cat-budget"
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
                <Label htmlFor="cat-must">Essential Category</Label>
                <p className="text-muted-foreground text-xs">
                  Mark as a must-have expense (bills, food, etc.)
                </p>
              </div>
              <Switch id="cat-must" checked={isMust} onCheckedChange={setIsMust} />
            </div>
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
            <Button type="submit" disabled={createCategory.isPending || !name.trim() || !groupId}>
              {createCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
