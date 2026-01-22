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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  useUpdateTransaction,
  useCategoryGroups,
  usePayees,
  useTags,
} from '@/lib/hooks/use-budget';
import { type BudgetTransaction } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

interface EditTransactionDialogProps {
  transaction: BudgetTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner component that receives transaction as required prop
function EditTransactionForm({
  transaction,
  onOpenChange,
}: {
  transaction: BudgetTransaction;
  onOpenChange: (open: boolean) => void;
}) {
  const [type, setType] = useState<'expense' | 'income'>(transaction.type);
  const [date, setDate] = useState(transaction.transactionDate);
  const [amount, setAmount] = useState(transaction.amountIls.toString());
  const [categoryId, setCategoryId] = useState(transaction.categoryId || '');
  const [payeeId, setPayeeId] = useState(transaction.payeeId || '');
  const [notes, setNotes] = useState(transaction.notes || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(transaction.tagIds);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: tags = [] } = useTags();
  const updateTransaction = useUpdateTransaction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    await updateTransaction.mutateAsync({
      id: transaction.id,
      type,
      transactionDate: date,
      amountIls: amountNum,
      categoryId: categoryId || null,
      payeeId: payeeId || null,
      notes: notes || null,
      tagIds: selectedTags,
    });

    onOpenChange(false);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Transaction</DialogTitle>
        <DialogDescription>Update the transaction details.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Type Toggle */}
        <div className="grid gap-2">
          <Label>Type</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'expense' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setType('expense')}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === 'income' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setType('income')}
            >
              Income
            </Button>
          </div>
        </div>

        {/* Date */}
        <div className="grid gap-2">
          <Label htmlFor="edit-date">Date</Label>
          <Input
            id="edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {/* Amount */}
        <div className="grid gap-2">
          <Label htmlFor="edit-amount">Amount (₪)</Label>
          <Input
            id="edit-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        {/* Category */}
        {type === 'expense' && (
          <div className="grid gap-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select
              value={categoryId || '__none__'}
              onValueChange={(v) => setCategoryId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Uncategorized</SelectItem>
                {categoryGroups.map((group) => (
                  <div key={group.id}>
                    <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
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
        )}

        {/* Payee */}
        <div className="grid gap-2">
          <Label htmlFor="edit-payee">Payee</Label>
          <Select
            value={payeeId || '__none__'}
            onValueChange={(v) => setPayeeId(v === '__none__' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select payee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No payee</SelectItem>
              {payees.map((payee) => (
                <SelectItem key={payee.id} value={payee.id}>
                  {payee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        <div className="grid gap-2">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  selectedTags.includes(tag.id)
                    ? 'text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
                style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="grid gap-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea
            id="edit-notes"
            placeholder="Optional notes..."
            value={notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateTransaction.isPending || !amount}>
          {updateTransaction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: EditTransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {transaction && (
          <EditTransactionForm
            key={transaction.id}
            transaction={transaction}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
