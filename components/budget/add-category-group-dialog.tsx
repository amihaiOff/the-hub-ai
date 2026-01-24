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
import { Loader2 } from 'lucide-react';
import { useCreateCategoryGroup } from '@/lib/hooks/use-budget';

interface AddCategoryGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCategoryGroupDialog({ open, onOpenChange }: AddCategoryGroupDialogProps) {
  const [name, setName] = useState('');
  const createCategoryGroup = useCreateCategoryGroup();

  const resetForm = () => {
    setName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createCategoryGroup.mutateAsync({ name: name.trim() });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Category Group</DialogTitle>
            <DialogDescription>Create a new group to organize your categories.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Bills & Utilities"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
            <Button type="submit" disabled={createCategoryGroup.isPending || !name.trim()}>
              {createCategoryGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
