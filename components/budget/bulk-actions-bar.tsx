'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FolderTree, Tag, Trash2 } from 'lucide-react';
import {
  useCategoryGroups,
  useTags,
  useBulkDeleteTransactions,
  useBulkCategorizeTransactions,
  useBulkAssignTag,
} from '@/lib/hooks/use-budget';
import { CategoryPickerSheet } from './category-picker-sheet';
import { BulkTagPickerSheet } from './bulk-tag-picker-sheet';

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
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: tags = [] } = useTags();
  const bulkDelete = useBulkDeleteTransactions();
  const bulkCategorize = useBulkCategorizeTransactions();
  const bulkAssignTag = useBulkAssignTag();

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

  const handleAssignTag = async (tagId: string) => {
    try {
      await bulkAssignTag.mutateAsync({ ids: selectedIds, tagId });
      onClearSelection();
    } catch (error) {
      console.error('Failed to assign tag to transactions:', error);
    }
  };

  return (
    <>
      {/* Count + Clear live in the sticky header above the list, so the bar
          only carries the actions themselves. */}
      <div className="bg-muted/95 fixed right-0 bottom-0 left-0 z-[60] flex items-center justify-between gap-2 border-t px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={bulkCategorize.isPending}
        >
          <FolderTree className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Set Category</span>
          <span className="sr-only sm:hidden">Set Category</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTagPickerOpen(true)}
          disabled={bulkAssignTag.isPending}
        >
          <Tag className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Add Tag</span>
          <span className="sr-only sm:hidden">Add Tag</span>
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Delete</span>
          <span className="sr-only sm:hidden">Delete</span>
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

      <BulkTagPickerSheet
        open={tagPickerOpen}
        onOpenChange={setTagPickerOpen}
        tags={tags}
        onSelect={handleAssignTag}
        title={`Tag ${selectedCount} transaction${selectedCount > 1 ? 's' : ''}`}
      />
    </>
  );
}
