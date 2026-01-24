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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowRight } from 'lucide-react';
import { useMergeTags } from '@/lib/hooks/use-budget';
import { type BudgetTag } from '@/lib/utils/budget';

interface MergeTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTags: BudgetTag[];
  allTags: BudgetTag[];
  onComplete: () => void;
}

export function MergeTagsDialog({
  open,
  onOpenChange,
  selectedTags,
  allTags,
  onComplete,
}: MergeTagsDialogProps) {
  const [targetTagId, setTargetTagId] = useState<string>('');
  const mergeTags = useMergeTags();

  const targetTag = allTags.find((t) => t.id === targetTagId);
  const sourceTagIds = selectedTags.filter((t) => t.id !== targetTagId).map((t) => t.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTagId || sourceTagIds.length === 0) return;

    await mergeTags.mutateAsync({
      sourceTagIds,
      targetTagId,
    });

    setTargetTagId('');
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Merge Tags</DialogTitle>
            <DialogDescription>
              Merge {selectedTags.length} tags into one. All transactions will be updated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Source Tags */}
            <div className="grid gap-2">
              <Label>Tags to merge</Label>
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                    <span className="opacity-75">({tag.transactionCount})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="text-muted-foreground h-5 w-5" />
            </div>

            {/* Target Tag */}
            <div className="grid gap-2">
              <Label htmlFor="target-tag">Keep this tag</Label>
              <Select value={targetTagId} onValueChange={setTargetTagId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target tag" />
                </SelectTrigger>
                <SelectContent>
                  {selectedTags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            {targetTag && sourceTagIds.length > 0 && (
              <div className="bg-muted rounded-lg p-3 text-sm">
                <p>
                  <strong>{sourceTagIds.length}</strong> tag{sourceTagIds.length > 1 ? 's' : ''}{' '}
                  will be deleted and all their transactions will be tagged with{' '}
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ backgroundColor: targetTag.color }}
                  >
                    {targetTag.name}
                  </span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTargetTagId('');
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mergeTags.isPending || !targetTagId || sourceTagIds.length === 0}
            >
              {mergeTags.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Merge Tags
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
