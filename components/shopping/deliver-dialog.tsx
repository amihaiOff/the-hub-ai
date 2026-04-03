'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, PackageCheck } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useShoppingCart, useDeliverCart, type ShoppingCartItem } from '@/lib/hooks/use-shopping';

interface DeliverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliverDialog({ open, onOpenChange }: DeliverDialogProps) {
  const { data: cartItems = [] } = useShoppingCart();
  const checkedItems = useMemo(() => cartItems.filter((item) => item.checked), [cartItems]);

  // Use a key based on open state to remount the form content when dialog opens
  const dialogKey = open ? 'open' : 'closed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <DeliverForm
            key={dialogKey}
            checkedItems={checkedItems}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeliverForm({
  checkedItems,
  onClose,
}: {
  checkedItems: ShoppingCartItem[];
  onClose: () => void;
}) {
  const deliverCart = useDeliverCart();

  // Pre-check all items as delivered (user unchecks missing ones)
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(
    () => new Set(checkedItems.map((item) => item.itemId))
  );

  const toggleDelivered = (itemId: string) => {
    setDeliveredIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    const missingItemIds = checkedItems
      .filter((item) => !deliveredIds.has(item.itemId))
      .map((item) => item.itemId);

    await deliverCart.mutateAsync({ missingItemIds });
    onClose();
  };

  // Group checked items by category
  const groupedItems = useMemo(() => {
    const groups = new Map<string, { categoryName: string; items: ShoppingCartItem[] }>();
    for (const item of checkedItems) {
      const existing = groups.get(item.categoryId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.categoryId, { categoryName: item.categoryName, items: [item] });
      }
    }
    return Array.from(groups.entries());
  }, [checkedItems]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5" />
          Mark as Delivered
        </DialogTitle>
        <DialogDescription>
          Select any items that didn&apos;t arrive -- they&apos;ll stay in your next cart.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[50vh]">
        {groupedItems.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No checked items to deliver.
          </p>
        )}

        <div className="space-y-4 py-2">
          {groupedItems.map(([categoryId, group]) => (
            <div key={categoryId}>
              <h3 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
                {group.categoryName}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-md px-3 py-2.5">
                    <Checkbox
                      checked={deliveredIds.has(item.itemId)}
                      onCheckedChange={() => toggleDelivered(item.itemId)}
                      className="h-5 w-5"
                    />
                    <span className="text-foreground text-sm">{item.itemName}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={deliverCart.isPending || checkedItems.length === 0}
        >
          {deliverCart.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirm Delivery
        </Button>
      </DialogFooter>
    </>
  );
}
