'use client';

import { useState, useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateHolding } from '@/lib/hooks/use-portfolio';
import type { HoldingValue } from '@/lib/utils/portfolio';

interface EditHoldingDialogProps {
  holdingId: string;
  holding: HoldingValue;
  // Controlled mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EditHoldingDialog({
  holdingId,
  holding,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditHoldingDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  // Create a key that changes when dialog opens with new values
  const dialogKey = useMemo(
    () =>
      `${open}-${holdingId}-${holding.quantity}-${holding.avgCostBasis}-${holding.name}-${holding.taseSymbol}`,
    [open, holdingId, holding.quantity, holding.avgCostBasis, holding.name, holding.taseSymbol]
  );

  const [quantity, setQuantity] = useState(holding.quantity.toString());
  const [avgCostBasis, setAvgCostBasis] = useState(holding.avgCostBasis.toString());
  const [stockName, setStockName] = useState(holding.name || '');
  const [taseSymbol, setTaseSymbol] = useState(holding.taseSymbol || '');
  const [error, setError] = useState('');
  const [lastDialogKey, setLastDialogKey] = useState(dialogKey);
  const updateHolding = useUpdateHolding();

  // Reset form when dialog key changes (instead of useEffect with setState)
  if (dialogKey !== lastDialogKey) {
    setQuantity(holding.quantity.toString());
    setAvgCostBasis(holding.avgCostBasis.toString());
    setStockName(holding.name || '');
    setTaseSymbol(holding.taseSymbol || '');
    setError('');
    setLastDialogKey(dialogKey);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const qty = parseFloat(quantity);
    const cost = parseFloat(avgCostBasis);

    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    if (isNaN(cost) || cost < 0) {
      setError('Cost basis must be a non-negative number');
      return;
    }

    try {
      await updateHolding.mutateAsync({
        id: holdingId,
        quantity: qty,
        avgCostBasis: cost,
        name: stockName.trim() || null,
        taseSymbol: taseSymbol.trim() || null,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update holding');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Only render trigger in uncontrolled mode */}
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <Pencil className="h-3 w-3" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit {holding.symbol}</DialogTitle>
            <DialogDescription>
              Update the quantity or cost basis for this holding.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div
                role="alert"
                className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
              >
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-quantity">Quantity</Label>
              <Input
                id="edit-quantity"
                type="number"
                step="any"
                min="0.00000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-avgCostBasis">Average Cost Basis</Label>
              <Input
                id="edit-avgCostBasis"
                type="number"
                step="0.01"
                min="0"
                value={avgCostBasis}
                onChange={(e) => setAvgCostBasis(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-stockName">Stock Name</Label>
              <Input
                id="edit-stockName"
                type="text"
                value={stockName}
                onChange={(e) => setStockName(e.target.value)}
                placeholder="e.g., Apple Inc."
              />
              <p className="text-muted-foreground text-xs">
                Full company name (displayed under ticker)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-subtitle">Subtitle</Label>
              <Input
                id="edit-subtitle"
                type="text"
                value={taseSymbol}
                onChange={(e) => setTaseSymbol(e.target.value)}
                placeholder="e.g., TASE: 1159169"
              />
              <p className="text-muted-foreground text-xs">
                Additional info shown in tooltip (optional)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={updateHolding.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateHolding.isPending}>
              {updateHolding.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
