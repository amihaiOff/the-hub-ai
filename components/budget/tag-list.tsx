'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type BudgetTag } from '@/lib/utils/budget';

interface TagListProps {
  tags: BudgetTag[];
  selectedTagIds: string[];
  onToggleSelect: (tagId: string) => void;
  onEdit: (tag: BudgetTag) => void;
  onDelete: (tag: BudgetTag) => void;
}

export function TagList({ tags, selectedTagIds, onToggleSelect, onEdit, onDelete }: TagListProps) {
  if (tags.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No tags created yet</p>
        <p className="mt-1 text-sm">Create tags to organize your transactions</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {tags.map((tag) => (
        <div key={tag.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Checkbox
            checked={selectedTagIds.includes(tag.id)}
            onCheckedChange={() => onToggleSelect(tag.id)}
          />

          <div className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />

          <div className="flex-1">
            <span className="font-medium">{tag.name}</span>
          </div>

          <span className="text-muted-foreground text-sm tabular-nums">
            {tag.transactionCount} transaction{tag.transactionCount !== 1 ? 's' : ''}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(tag)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(tag)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
