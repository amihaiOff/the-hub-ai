'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCashBalance } from '@/lib/hooks/use-portfolio';
import { VALID_CURRENCIES } from '@/lib/validations/common';

interface AddCashDialogProps {
  accountId: string;
  existingCurrencies: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCashDialog({
  accountId,
  existingCurrencies,
  open,
  onOpenChange,
}: AddCashDialogProps) {
  const [currency, setCurrency] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createCash = useCreateCashBalance();

  // Filter out currencies that already exist
  const availableCurrencies = VALID_CURRENCIES.filter((c) => !existingCurrencies.includes(c));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!currency) {
      setError('Please select a currency');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Please enter a valid non-negative amount');
      return;
    }

    try {
      await createCash.mutateAsync({
        accountId,
        currency,
        amount: amountNum,
      });

      // Reset and close
      setCurrency('');
      setAmount('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add cash balance');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setCurrency('');
      setAmount('');
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add Cash Balance</DialogTitle>
          <DialogDescription>
            Add uninvested cash to track in this account. Cash is included in your total portfolio
            value.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              {availableCurrencies.length > 0 ? (
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCurrencies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground text-sm">
                  All currencies are already added to this account.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={availableCurrencies.length === 0}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCash.isPending || availableCurrencies.length === 0}
            >
              {createCash.isPending ? 'Adding...' : 'Add Cash'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
