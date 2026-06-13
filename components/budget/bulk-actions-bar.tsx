'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FolderTree, Trash2 } from 'lucide-react';
import {
  useCategoryGroups,
  useBulkDeleteTransactions,
  useBulkCategorizeTransactions,
} from '@/lib/hooks/use-budget';
import { CategoryPickerSheet } from './category-picker-sheet';

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
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const handleCategorize = async (categoryId: string | null) => {
    if (!categoryId) return; // bulk categorize requires a target category
    try {
      await bulkCategorize.mutateAsync({ ids: selectedIds, categoryId });
      onClearSelection();
    } catch (error) {
      console.error('Failed to categorize transactions:', error);
    }
  };

  return (
    <>
      {/* Count + Clear live in the sticky header above the list, so the bar
          only carries the actions themselves. */}
      <div className="bg-muted/95 fixed right-0 bottom-0 left-0 z-[60] flex items-center justify-end gap-2 border-t px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={bulkCategorize.isPending}
        >
          <FolderTree className="mr-1 h-4 w-4" />
          Set Category
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentCategoryId={null}
        categoryGroups={categoryGroups}
        onSelect={handleCategorize}
        allowNone={false}
        title={`Categorize ${selectedCount} transaction${selectedCount > 1 ? 's' : ''}`}
      />
    </>
  );
}
