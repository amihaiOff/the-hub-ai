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
import { useUpdateCashBalance } from '@/lib/hooks/use-portfolio';
import type { CashBalance } from '@/lib/utils/portfolio';

interface EditCashDialogProps {
  accountId: string;
  cashBalance: CashBalance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner form component that resets state when key changes
function EditCashForm({ accountId, cashBalance, onOpenChange }: Omit<EditCashDialogProps, 'open'>) {
  const [amount, setAmount] = useState(cashBalance.amount.toString());
  const [error, setError] = useState<string | null>(null);

  const updateCash = useUpdateCashBalance();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Please enter a valid non-negative amount');
      return;
    }

    try {
      await updateCash.mutateAsync({
        accountId,
        cashId: cashBalance.id,
        amount: amountNum,
      });

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cash balance');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" value={cashBalance.currency} disabled />
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
            autoFocus
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateCash.isPending}>
          {updateCash.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditCashDialog({
  accountId,
  cashBalance,
  open,
  onOpenChange,
}: EditCashDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Edit {cashBalance.currency} Cash Balance</DialogTitle>
          <DialogDescription>Update the cash amount for this currency.</DialogDescription>
        </DialogHeader>

        {/* Key forces form to remount with fresh state when dialog opens */}
        {open && (
          <EditCashForm
            key={`${cashBalance.id}-${cashBalance.amount}`}
            accountId={accountId}
            cashBalance={cashBalance}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
