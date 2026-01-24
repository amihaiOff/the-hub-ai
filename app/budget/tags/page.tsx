'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Merge, AlertCircle, Loader2 } from 'lucide-react';
import { useTags, useDeleteTag } from '@/lib/hooks/use-budget';
import { type BudgetTag } from '@/lib/utils/budget';
import { TagList, AddTagDialog, MergeTagsDialog } from '@/components/budget';

export default function TagsPage() {
  const [showAddTag, setShowAddTag] = useState(false);
  const [editingTag, setEditingTag] = useState<BudgetTag | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showMerge, setShowMerge] = useState(false);

  const { data: tags = [], isLoading, error } = useTags();
  const deleteTag = useDeleteTag();

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  const toggleTagSelect = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleDeleteTag = async (tag: BudgetTag) => {
    if (confirm(`Delete tag "${tag.name}"? It will be removed from all transactions.`)) {
      try {
        await deleteTag.mutateAsync(tag.id);
        setSelectedTagIds((prev) => prev.filter((id) => id !== tag.id));
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    }
  };

  const handleEditTag = (tag: BudgetTag) => {
    setEditingTag(tag);
    setShowAddTag(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Tags</h1>
          <p className="text-muted-foreground text-sm">
            Create tags to add extra context to transactions
          </p>
        </div>
        <div className="flex gap-2">
          {selectedTagIds.length >= 2 && (
            <Button variant="outline" onClick={() => setShowMerge(true)}>
              <Merge className="mr-1.5 h-4 w-4" />
              Merge ({selectedTagIds.length})
            </Button>
          )}
          <Button onClick={() => setShowAddTag(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Tag
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load tags</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Tags List */}
      {!isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <TagList
              tags={tags}
              selectedTagIds={selectedTagIds}
              onToggleSelect={toggleTagSelect}
              onEdit={handleEditTag}
              onDelete={handleDeleteTag}
            />
          </CardContent>
        </Card>
      )}

      {/* Selection Info */}
      {selectedTagIds.length > 0 && (
        <div className="text-muted-foreground text-sm">
          {selectedTagIds.length} tag{selectedTagIds.length > 1 ? 's' : ''} selected
          {selectedTagIds.length >= 2 && ' — Click "Merge" to combine them'}
        </div>
      )}

      {/* Dialogs */}
      <AddTagDialog
        open={showAddTag}
        onOpenChange={(open) => {
          setShowAddTag(open);
          if (!open) setEditingTag(null);
        }}
        editTag={editingTag}
      />
      <MergeTagsDialog
        open={showMerge}
        onOpenChange={setShowMerge}
        selectedTags={selectedTags}
        allTags={tags}
        onComplete={() => setSelectedTagIds([])}
      />
    </div>
  );
}
