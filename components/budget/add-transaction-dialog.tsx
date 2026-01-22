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
  useCreateTransaction,
  useCategoryGroups,
  usePayees,
  useTags,
} from '@/lib/hooks/use-budget';
import { cn } from '@/lib/utils';

interface AddTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategoryId?: string;
}

export function AddTransactionDialog({
  open,
  onOpenChange,
  defaultCategoryId,
}: AddTransactionDialogProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId || '');
  const [payeeId, setPayeeId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: tags = [] } = useTags();
  const createTransaction = useCreateTransaction();

  const resetForm = () => {
    setType('expense');
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setCategoryId(defaultCategoryId || '');
    setPayeeId('');
    setNotes('');
    setSelectedTags([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    await createTransaction.mutateAsync({
      type,
      transactionDate: date,
      amountIls: amountNum,
      categoryId: categoryId || null,
      payeeId: payeeId || null,
      notes: notes || null,
      tagIds: selectedTags,
    });

    resetForm();
    onOpenChange(false);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>Record a new income or expense transaction.</DialogDescription>
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
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Amount */}
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (₪)</Label>
              <Input
                id="amount"
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
                <Label htmlFor="category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
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
              <Label htmlFor="payee">Payee</Label>
              <Select value={payeeId} onValueChange={setPayeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payee" />
                </SelectTrigger>
                <SelectContent>
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
                    style={
                      selectedTags.includes(tag.id) ? { backgroundColor: tag.color } : undefined
                    }
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes..."
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createTransaction.isPending || !amount}>
              {createTransaction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Transaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
