'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  PackageCheck,
  HelpCircle,
  Package,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useShoppingCart,
  useToggleCartItem,
  useRemoveFromCart,
  useClearCheckedItems,
  useShoppingWarnings,
  useAddToCart,
  useUpdateCartQuantity,
} from '@/lib/hooks/use-shopping';
import { CartItemRow } from '@/components/shopping/cart-item-row';
import { AddItemSheet } from '@/components/shopping/add-item-sheet';
import { DeliverDialog } from '@/components/shopping/deliver-dialog';
import Link from 'next/link';

export default function ShoppingPage() {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showDeliverDialog, setShowDeliverDialog] = useState(false);

  const { data: cartItems = [], isLoading, error } = useShoppingCart();
  const { data: warnings = [] } = useShoppingWarnings();
  const toggleItem = useToggleCartItem();
  const removeItem = useRemoveFromCart();
  const clearChecked = useClearCheckedItems();
  const addToCart = useAddToCart();
  const updateQuantity = useUpdateCartQuantity();

  const checkedCount = useMemo(() => cartItems.filter((item) => item.checked).length, [cartItems]);
  const uncheckedItems = useMemo(() => cartItems.filter((item) => !item.checked), [cartItems]);
  const checkedItems = useMemo(() => cartItems.filter((item) => item.checked), [cartItems]);

  // Filter warnings: exclude items already in cart
  const cartItemIds = useMemo(() => new Set(cartItems.map((ci) => ci.itemId)), [cartItems]);
  const activeWarnings = useMemo(
    () => warnings.filter((w) => !cartItemIds.has(w.id)),
    [warnings, cartItemIds]
  );

  // Group items by category
  const uncheckedGroups = useMemo(() => {
    const groups = new Map<string, { categoryName: string; items: typeof uncheckedItems }>();
    for (const item of uncheckedItems) {
      const existing = groups.get(item.categoryId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.categoryId, { categoryName: item.categoryName, items: [item] });
      }
    }
    return Array.from(groups.entries());
  }, [uncheckedItems]);

  const checkedGroups = useMemo(() => {
    const groups = new Map<string, { categoryName: string; items: typeof checkedItems }>();
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

  const handleToggle = (id: string, checked: boolean) => {
    toggleItem.mutate({ id, checked });
  };

  const handleRemove = (id: string) => {
    removeItem.mutate(id);
  };

  const handleQuantityChange = (id: string, quantity: number) => {
    updateQuantity.mutate({ id, quantity });
  };

  const handleClearChecked = () => {
    clearChecked.mutate();
  };

  const handleAddWarningToCart = (itemId: string) => {
    addToCart.mutate({ itemId });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title text-4xl font-bold tracking-tight">
            Shopping List
          </h1>
          {cartItems.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {cartItems.length}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/shopping/items">
            <Button variant="outline" size="sm">
              <Package className="mr-1.5 h-4 w-4" />
              Items Library
            </Button>
          </Link>
          {checkedCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowDeliverDialog(true)}>
              <PackageCheck className="mr-1.5 h-4 w-4" />
              Mark as Delivered
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearChecked}
            disabled={checkedCount === 0 || clearChecked.isPending}
          >
            {clearChecked.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-4 w-4" />
            )}
            Clear Checked
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load shopping cart</p>
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

      {/* Warnings / Suggested Items */}
      {!isLoading && activeWarnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-amber-500">Suggested Items</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 cursor-help text-amber-500/60" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Items that haven&apos;t been purchased within their configured warning period.
                      Add them to your cart if you need them.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="space-y-2">
              {activeWarnings.map((warning) => (
                <div
                  key={warning.id}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground text-sm font-medium">{warning.name}</span>
                    <p className="text-muted-foreground text-xs">
                      Hasn&apos;t been bought in {warning.daysSinceLastPurchase} days
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => handleAddWarningToCart(warning.id)}
                    disabled={addToCart.isPending}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && cartItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingCart className="text-muted-foreground mb-4 h-12 w-12" />
          <h2 className="text-foreground mb-1 text-lg font-semibold">Your cart is empty</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Add items to start building your shopping list.
          </p>
          <p className="text-muted-foreground text-sm">Tap the + button to get started.</p>
        </div>
      )}

      {/* Unchecked items grouped by category */}
      {!isLoading && uncheckedGroups.length > 0 && (
        <div className="space-y-4">
          {uncheckedGroups.map(([categoryId, group]) => (
            <div key={categoryId}>
              <h3 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
                {group.categoryName}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <CartItemRow
                    key={item.id}
                    id={item.id}
                    name={item.itemName}
                    quantity={item.quantity}
                    checked={item.checked}
                    onToggle={handleToggle}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Checked items section */}
      {!isLoading && checkedGroups.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs font-medium">
              Checked ({checkedCount})
            </span>
            <div className="bg-border h-px flex-1" />
          </div>
          <div className="space-y-4">
            {checkedGroups.map(([categoryId, group]) => (
              <div key={categoryId}>
                <h3 className="text-muted-foreground mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
                  {group.categoryName}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <CartItemRow
                      key={item.id}
                      id={item.id}
                      name={item.itemName}
                      quantity={item.quantity}
                      checked={item.checked}
                      onToggle={handleToggle}
                      onQuantityChange={handleQuantityChange}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add Item Sheet */}
      <AddItemSheet open={showAddSheet} onOpenChange={setShowAddSheet} />

      {/* Deliver Dialog */}
      <DeliverDialog open={showDeliverDialog} onOpenChange={setShowDeliverDialog} />

      {/* FAB - Add Items */}
      <button
        onClick={() => setShowAddSheet(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
