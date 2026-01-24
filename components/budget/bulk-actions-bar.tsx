'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, FolderTree, X } from 'lucide-react';
import {
  useCategoryGroups,
  useBulkDeleteTransactions,
  useBulkCategorizeTransactions,
} from '@/lib/hooks/use-budget';
import { useState } from 'react';

interface BulkActionsBarProps {
  selectedCount: number;
  selectedIds: string[];
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  onClearSelection,
}: BulkActionsBarProps) {
  const [categoryId, setCategoryId] = useState<string>('');
  const { data: categoryGroups = [] } = useCategoryGroups();
  const bulkDelete = useBulkDeleteTransactions();
  const bulkCategorize = useBulkCategorizeTransactions();

  const handleDelete = async () => {
    if (confirm(`Delete ${selectedCount} transaction${selectedCount > 1 ? 's' : ''}?`)) {
      try {
        await bulkDelete.mutateAsync(selectedIds);
        onClearSelection();
      } catch (error) {
        console.error('Failed to delete transactions:', error);
      }
    }
  };

  const handleCategorize = async () => {
    if (!categoryId) return;
    try {
      await bulkCategorize.mutateAsync({ ids: selectedIds, categoryId });
      setCategoryId('');
      onClearSelection();
    } catch (error) {
      console.error('Failed to categorize transactions:', error);
    }
  };

  return (
    <div className="bg-muted/80 sticky right-0 bottom-0 left-0 z-10 flex items-center justify-between gap-2 border-t px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {/* Categorize */}
        <div className="flex items-center gap-1">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-8 w-[140px] sm:w-[180px]">
              <SelectValue placeholder="Category..." />
            </SelectTrigger>
            <SelectContent>
              {categoryGroups.map((group) => (
                <div key={group.id}>
                  <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                    {group.name}
                  </div>
                  {group.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCategorize}
            disabled={!categoryId || bulkCategorize.isPending}
          >
            <FolderTree className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Set Category</span>
          </Button>
        </div>

        {/* Delete */}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    </div>
  );
}
