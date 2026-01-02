'use client';

import { useState } from 'react';
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
}

export function EditHoldingDialog({ holdingId, holding }: EditHoldingDialogProps) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(holding.quantity.toString());
  const [avgCostBasis, setAvgCostBasis] = useState(holding.avgCostBasis.toString());
  const [error, setError] = useState('');
  const updateHolding = useUpdateHolding();

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
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update holding');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Pencil className="h-3 w-3" />
        </Button>
      </DialogTrigger>
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
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
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
