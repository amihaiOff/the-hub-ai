'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { useCreateHolding } from '@/lib/hooks/use-portfolio';

interface AddHoldingDialogProps {
  accountId: string;
  accountName: string;
}

export function AddHoldingDialog({ accountId, accountName }: AddHoldingDialogProps) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCostBasis, setAvgCostBasis] = useState('');
  const [error, setError] = useState('');
  const createHolding = useCreateHolding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const qty = parseFloat(quantity);
    const cost = parseFloat(avgCostBasis);

    if (!symbol.trim()) {
      setError('Stock symbol is required');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    if (isNaN(cost) || cost < 0) {
      setError('Cost basis must be a non-negative number');
      return;
    }

    try {
      await createHolding.mutateAsync({
        accountId,
        symbol: symbol.toUpperCase().trim(),
        quantity: qty,
        avgCostBasis: cost,
      });
      setSymbol('');
      setQuantity('');
      setAvgCostBasis('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add holding');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3 w-3" />
          Add Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Stock Holding</DialogTitle>
            <DialogDescription>
              Add a new stock to {accountName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="symbol">Stock Symbol *</Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL, GOOGL, MSFT"
                required
                className="uppercase"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                min="0.00000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g., 10, 0.5"
                required
              />
              <p className="text-xs text-muted-foreground">
                Number of shares (supports fractional shares)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="avgCostBasis">Average Cost Basis *</Label>
              <Input
                id="avgCostBasis"
                type="number"
                step="0.01"
                min="0"
                value={avgCostBasis}
                onChange={(e) => setAvgCostBasis(e.target.value)}
                placeholder="e.g., 150.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Average price per share you paid
              </p>
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
            <Button type="submit" disabled={createHolding.isPending}>
              {createHolding.isPending ? 'Adding...' : 'Add Holding'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
