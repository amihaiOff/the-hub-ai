'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import type { BudgetTag } from '@/lib/utils/budget';

interface TagPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: BudgetTag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  title?: string;
}

export function TagPickerSheet({
  open,
  onOpenChange,
  tags,
  selectedTagIds,
  onChange,
  title = 'Choose tags',
}: TagPickerSheetProps) {
  const [search, setSearch] = useState('');

  const filteredTags = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const selectedSet = new Set(selectedTagIds);

  const toggle = (tagId: string) => {
    const next = new Set(selectedSet);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    onChange(Array.from(next));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSearch('');
      }}
    >
      <SheetContent side="bottom" className="flex h-[85vh] flex-col gap-0 rounded-t-2xl p-0">
        <SheetHeader className="border-border/40 border-b p-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="p-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags"
              className="h-11 pl-9"
              autoFocus={false}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          {filteredTags.length === 0 && (
            <div className="text-muted-foreground p-6 text-center text-sm">
              {tags.length === 0 ? 'No tags created yet' : 'No matching tags'}
            </div>
          )}
          {filteredTags.map((tag) => {
            const isSelected = selectedSet.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  'hover:bg-muted/60 active:bg-muted',
                  isSelected && 'bg-muted/60'
                )}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 text-sm">{tag.name}</span>
                {isSelected && <Check className="text-primary h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
