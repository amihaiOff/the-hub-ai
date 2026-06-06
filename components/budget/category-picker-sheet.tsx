'use client';

import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { CategoryGroupIcon } from '@/lib/utils/category-group-icons';
import type { BudgetCategoryGroup } from '@/lib/utils/budget';

interface CategoryPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCategoryId: string | null;
  categoryGroups: BudgetCategoryGroup[];
  onSelect: (categoryId: string | null) => void;
  allowNone?: boolean;
  title?: string;
}

export function CategoryPickerSheet({
  open,
  onOpenChange,
  currentCategoryId,
  categoryGroups,
  onSelect,
  allowNone = true,
  title = 'Choose category',
}: CategoryPickerSheetProps) {
  const [search, setSearch] = useState('');

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categoryGroups;
    return categoryGroups
      .map((g) => ({
        ...g,
        categories: g.categories.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.categories.length > 0);
  }, [categoryGroups, search]);

  const handleSelect = (categoryId: string | null) => {
    onSelect(categoryId);
    onOpenChange(false);
    setSearch('');
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
              placeholder="Search categories"
              className="h-11 pl-9"
              autoFocus={false}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          {allowNone && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                'hover:bg-muted/60 active:bg-muted',
                currentCategoryId === null && 'bg-muted/60'
              )}
            >
              <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                <X className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-medium italic">Uncategorized</span>
              {currentCategoryId === null && <Check className="text-primary h-4 w-4" />}
            </button>
          )}

          {filteredGroups.length === 0 && (
            <div className="text-muted-foreground p-6 text-center text-sm">
              No matching categories
            </div>
          )}

          {filteredGroups.map((group) => (
            <div key={group.id} className="mt-2">
              <div className="text-muted-foreground flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
                <CategoryGroupIcon groupName={group.name} className="h-3.5 w-3.5" />
                {group.name}
              </div>
              {group.categories.map((category) => {
                const isSelected = category.id === currentCategoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleSelect(category.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      'hover:bg-muted/60 active:bg-muted',
                      isSelected && 'bg-muted/60'
                    )}
                  >
                    <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                      <CategoryGroupIcon groupName={group.name} className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm">{category.name}</span>
                    {isSelected && <Check className="text-primary h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
