'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Package,
  Clock,
  Star,
} from 'lucide-react';
import {
  useShoppingItems,
  useDeleteShoppingItem,
  type ShoppingItem,
} from '@/lib/hooks/use-shopping';
import { CreateItemDialog } from '@/components/shopping/create-item-dialog';
import { EditItemDialog } from '@/components/shopping/edit-item-dialog';

export default function ItemsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: items = [], isLoading, error } = useShoppingItems(debouncedSearch);
  const deleteItem = useDeleteShoppingItem();

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { categoryName: string; items: ShoppingItem[] }>();
    for (const item of items) {
      const existing = groups.get(item.categoryId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.categoryId, { categoryName: item.categoryName, items: [item] });
      }
    }
    return Array.from(groups.entries());
  }, [items]);

  const handleDelete = (id: string) => {
    deleteItem.mutate(id);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Package className="text-muted-foreground h-6 w-6" />
          <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">
            Items Library
          </h1>
          {items.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {items.length}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load items</p>
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

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="text-muted-foreground mb-4 h-12 w-12" />
          <h2 className="text-foreground mb-1 text-lg font-semibold">
            {debouncedSearch ? 'No items found' : 'No items yet'}
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {debouncedSearch
              ? 'Try a different search term.'
              : 'Create items to build your shopping list library.'}
          </p>
          {!debouncedSearch && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Item
            </Button>
          )}
        </div>
      )}

      {/* Items grouped by category */}
      {!isLoading &&
        groupedItems.map(([categoryId, group]) => (
          <div key={categoryId}>
            <h3 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
              {group.categoryName}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-md px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground truncate text-sm font-medium">
                        {item.name}
                      </span>
                      {item.nameHe && (
                        <span dir="rtl" className="text-muted-foreground truncate text-xs">
                          {item.nameHe}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      {item.warningDays != null && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="mr-1 h-3 w-3" />
                          {item.warningDays}d
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground h-8 w-8"
                      onClick={() => setEditingItem(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleteItem.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* Create Item Dialog */}
      <CreateItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultName={search}
      />

      {/* Edit Item Dialog */}
      <EditItemDialog
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        item={editingItem}
      />
    </div>
  );
}
