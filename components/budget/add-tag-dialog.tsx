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
import { useCreateTag, useUpdateTag } from '@/lib/hooks/use-budget';
import { type BudgetTag, TAG_COLORS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

interface AddTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTag?: BudgetTag | null;
}

// Inner form component that initializes state from props
function TagForm({
  editTag,
  onOpenChange,
}: {
  editTag?: BudgetTag | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(editTag?.name || '');
  const [color, setColor] = useState(editTag?.color || TAG_COLORS[0]);

  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const isEditing = !!editTag;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (isEditing && editTag) {
        await updateTag.mutateAsync({
          id: editTag.id,
          name: name.trim(),
          color,
        });
      } else {
        await createTag.mutateAsync({
          name: name.trim(),
          color,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save tag:', error);
    }
  };

  const isPending = createTag.isPending || updateTag.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Tag' : 'Add Tag'}</DialogTitle>
        <DialogDescription>
          {isEditing ? 'Update the tag details.' : 'Create a new tag to organize transactions.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Name */}
        <div className="grid gap-2">
          <Label htmlFor="tag-name">Tag Name</Label>
          <Input
            id="tag-name"
            placeholder="e.g., Subscription"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Color Picker */}
        <div className="grid gap-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Select color ${c}`}
                aria-pressed={color === c}
                className={cn(
                  'h-8 w-8 rounded-full transition-transform',
                  color === c && 'ring-offset-background ring-2 ring-offset-2'
                )}
                style={{ backgroundColor: c, '--tw-ring-color': c } as React.CSSProperties}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="grid gap-2">
          <Label>Preview</Label>
          <div>
            <span
              className="inline-block rounded-full px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {name || 'Tag Name'}
            </span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Add Tag'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddTagDialog({ open, onOpenChange, editTag }: AddTagDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <TagForm key={editTag?.id || 'new'} editTag={editTag} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}
