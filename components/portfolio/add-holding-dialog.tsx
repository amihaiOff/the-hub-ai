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
import { Autocomplete } from '@/components/ui/autocomplete';
import { useCreateHolding } from '@/lib/hooks/use-portfolio';
import { useStockSearch } from '@/lib/hooks/use-stock-search';

interface AddHoldingDialogProps {
  accountId: string;
  accountName: string;
  accountCurrency?: string;
}

export function AddHoldingDialog({
  accountId,
  accountName,
  accountCurrency = 'USD',
}: AddHoldingDialogProps) {
  // Cost basis is always entered in the account's native currency
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCostBasis, setAvgCostBasis] = useState('');
  const [error, setError] = useState('');
  const createHolding = useCreateHolding();
  const { options, isLoading: isSearching } = useStockSearch(symbol);

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
        <Button variant="ghost" size="icon-sm" title="Add stock">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add stock to {accountName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Stock Holding</DialogTitle>
            <DialogDescription>Add a new stock to {accountName}.</DialogDescription>
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
              <Label htmlFor="symbol">Stock Symbol *</Label>
              <Autocomplete
                id="symbol"
                value={symbol}
                onChange={(value) => setSymbol(value.toUpperCase())}
                onSelect={(option) => setSymbol(option.value)}
                options={options}
                isLoading={isSearching}
                placeholder="e.g., AAPL, GOOGL, MSFT"
                required
              />
              <p className="text-muted-foreground text-xs">
                Type to search or enter a symbol manually
              </p>
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
              <p className="text-muted-foreground text-xs">
                Number of shares (supports fractional shares)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="avgCostBasis">Average Cost Basis ({accountCurrency}) *</Label>
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
              <p className="text-muted-foreground text-xs">
                Average price per share in {accountCurrency}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
