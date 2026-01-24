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
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useCategoryGroups,
} from '@/lib/hooks/use-budget';
import { type BudgetTransaction, formatCurrencyILS } from '@/lib/utils/budget';

interface SplitItem {
  id: string;
  amount: string;
  categoryId: string;
  notes: string;
}

interface SplitTransactionDialogProps {
  transaction: BudgetTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner component that receives transaction as required prop
function SplitTransactionForm({
  transaction,
  onOpenChange,
}: {
  transaction: BudgetTransaction;
  onOpenChange: (open: boolean) => void;
}) {
  const halfAmount = (transaction.amountIls / 2).toFixed(2);
  const [splits, setSplits] = useState<SplitItem[]>([
    {
      id: '1',
      amount: halfAmount,
      categoryId: transaction.categoryId || '',
      notes: '',
    },
    {
      id: '2',
      amount: halfAmount,
      categoryId: '',
      notes: '',
    },
  ]);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const createTransaction = useCreateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const totalSplit = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const remaining = transaction.amountIls - totalSplit;
  const isValid = Math.abs(remaining) < 0.01;

  const addSplit = () => {
    setSplits((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        amount: remaining > 0 ? remaining.toFixed(2) : '0',
        categoryId: '',
        notes: '',
      },
    ]);
  };

  const removeSplit = (id: string) => {
    if (splits.length > 2) {
      setSplits((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const updateSplit = (id: string, field: keyof SplitItem, value: string) => {
    setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    // Create split transactions
    for (const split of splits) {
      await createTransaction.mutateAsync({
        type: transaction.type,
        transactionDate: transaction.transactionDate,
        amountIls: parseFloat(split.amount),
        categoryId: split.categoryId || null,
        payeeId: transaction.payeeId,
        notes: split.notes || transaction.notes,
        tagIds: transaction.tagIds,
      });
    }

    // Delete original transaction
    await deleteTransaction.mutateAsync(transaction.id);

    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Split Transaction</DialogTitle>
        <DialogDescription>
          Split this transaction into multiple categories. Total:{' '}
          {formatCurrencyILS(transaction.amountIls)}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-80 space-y-3 overflow-y-auto py-4">
        {splits.map((split, index) => (
          <div key={split.id} className="bg-muted/50 rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Split {index + 1}</span>
              {splits.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeSplit(split.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">Amount (₪)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={split.amount}
                  onChange={(e) => updateSplit(split.id, 'amount', e.target.value)}
                  className="h-8"
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={split.categoryId}
                  onValueChange={(v) => updateSplit(split.id, 'categoryId', v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryGroups.map((group) => (
                      <div key={group.id}>
                        <div className="text-muted-foreground px-2 py-1 text-xs font-semibold">
                          {group.name}
                        </div>
                        {group.categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-2 grid gap-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={split.notes}
                onChange={(e) => updateSplit(split.id, 'notes', e.target.value)}
                placeholder="Split notes..."
                className="h-8"
              />
            </div>
          </div>
        ))}

        {/* Add split button */}
        <Button type="button" variant="outline" size="sm" onClick={addSplit} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Split
        </Button>
      </div>

      {/* Summary */}
      <div className="border-t pt-3">
        <div className="flex justify-between text-sm">
          <span>Total Split:</span>
          <span className="font-medium tabular-nums">{formatCurrencyILS(totalSplit)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Remaining:</span>
          <span
            className={`font-medium tabular-nums ${
              Math.abs(remaining) > 0.01 ? 'text-destructive' : 'text-green-500'
            }`}
          >
            {formatCurrencyILS(remaining)}
          </span>
        </div>
      </div>

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isValid || createTransaction.isPending || deleteTransaction.isPending}
        >
          {(createTransaction.isPending || deleteTransaction.isPending) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Split Transaction
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SplitTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: SplitTransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {transaction && open && (
          <SplitTransactionForm
            key={transaction.id}
            transaction={transaction}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
