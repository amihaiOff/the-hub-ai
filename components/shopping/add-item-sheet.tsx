'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Check, Loader2 } from 'lucide-react';
import { useShoppingItems, useAddToCart, useShoppingCategories } from '@/lib/hooks/use-shopping';
import { CreateItemDialog } from './create-item-dialog';

interface AddItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddItemSheet({ open, onOpenChange }: AddItemSheetProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: items = [], isLoading: itemsLoading } = useShoppingItems(debouncedSearch);
  const { data: categories = [] } = useShoppingCategories();
  const addToCart = useAddToCart();

  // Group items by category
  const groupedItems = useMemo(() => {
    const categoryMap = new Map<string, { name: string; items: typeof items }>();

    for (const item of items) {
      const existing = categoryMap.get(item.categoryId);
      if (existing) {
        existing.items.push(item);
      } else {
        categoryMap.set(item.categoryId, {
          name: item.categoryName,
          items: [item],
        });
      }
    }

    // Sort by category sort order
    return Array.from(categoryMap.entries()).sort((a, b) => {
      const catA = categories.find((c) => c.id === a[0]);
      const catB = categories.find((c) => c.id === b[0]);
      return (catA?.sortOrder ?? 0) - (catB?.sortOrder ?? 0);
    });
  }, [items, categories]);

  const handleAddToCart = (itemId: string) => {
    addToCart.mutate({ itemId });
  };

  const setCategoryRef = useCallback((categoryId: string, el: HTMLDivElement | null) => {
    if (el) {
      categoryRefs.current.set(categoryId, el);
    } else {
      categoryRefs.current.delete(categoryId);
    }
  }, []);

  const scrollToCategory = useCallback((categoryId: string) => {
    const el = categoryRefs.current.get(categoryId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            setSearch('');
            setDebouncedSearch('');
          }
          onOpenChange(value);
        }}
      >
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle>Add Items</SheetTitle>
            <SheetDescription>Search or browse items to add to your cart.</SheetDescription>
          </SheetHeader>

          {/* Search input */}
          <div className="relative px-4 pb-2">
            <Search className="text-muted-foreground absolute top-1/2 left-7 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Category jump bar */}
          {!debouncedSearch && groupedItems.length > 1 && (
            <div className="scrollbar-hide flex gap-1.5 overflow-x-auto px-4 pb-3">
              {groupedItems.map(([categoryId, group]) => (
                <button
                  key={categoryId}
                  type="button"
                  className="bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                  onClick={() => scrollToCategory(categoryId)}
                >
                  {group.name}
                </button>
              ))}
            </div>
          )}

          {/* Items list */}
          <ScrollArea className="flex-1 px-4">
            {itemsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}

            {!itemsLoading && groupedItems.length === 0 && (
              <div className="text-muted-foreground py-8 text-center text-sm">
                {debouncedSearch ? 'No items found.' : 'No items yet.'}
              </div>
            )}

            {!itemsLoading &&
              groupedItems.map(([categoryId, group]) => (
                <div key={categoryId} className="mb-4" ref={(el) => setCategoryRef(categoryId, el)}>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {group.name}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-md px-3 py-2.5"
                      >
                        <span className="text-foreground text-sm">{item.name}</span>
                        {item.inCart ? (
                          <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            <Check className="h-4 w-4" />
                            In cart
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddToCart(item.id)}
                            disabled={addToCart.isPending}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            {/* Create new item button */}
            <div className="border-border border-t pt-4 pb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create New Item
              </Button>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <CreateItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultName={search}
      />
    </>
  );
}
