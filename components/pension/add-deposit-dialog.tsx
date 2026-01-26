'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDeposit } from '@/lib/hooks/use-pension';
import { getSalaryMonthOptions } from '@/lib/utils/pension';

interface AddDepositDialogProps {
  accountId: string;
  accountName: string;
}

export function AddDepositDialog({ accountId, accountName }: AddDepositDialogProps) {
  const [open, setOpen] = useState(false);
  const [salaryMonth, setSalaryMonth] = useState('');
  const [depositDate, setDepositDate] = useState<Date | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [employer, setEmployer] = useState('');
  const [error, setError] = useState('');
  const createDeposit = useCreateDeposit();

  const salaryMonthOptions = getSalaryMonthOptions();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(amount);

    if (!salaryMonth) {
      setError('Salary month is required');
      return;
    }

    if (!depositDate) {
      setError('Deposit date is required');
      return;
    }

    if (isNaN(amountNum) || amountNum === 0) {
      setError('Amount is required (use negative for refunds/corrections)');
      return;
    }

    if (!employer.trim()) {
      setError('Employer name is required');
      return;
    }

    try {
      await createDeposit.mutateAsync({
        accountId,
        salaryMonth,
        depositDate: format(depositDate, 'yyyy-MM-dd'),
        amount: amountNum,
        employer: employer.trim(),
      });
      // Reset form
      setSalaryMonth('');
      setDepositDate(undefined);
      setAmount('');
      setEmployer('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add deposit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Add deposit">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Add deposit to {accountName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Deposit</DialogTitle>
            <DialogDescription>Record a new deposit to {accountName}.</DialogDescription>
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
              <Label htmlFor="salaryMonth">Salary Month *</Label>
              <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                <SelectTrigger id="salaryMonth">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {salaryMonthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Which month&apos;s salary this deposit is for
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="depositDate">Deposit Date *</Label>
              <DatePicker
                id="depositDate"
                date={depositDate}
                onDateChange={setDepositDate}
                placeholder="Select deposit date"
              />
              <p className="text-muted-foreground text-xs">When the money was actually deposited</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (ILS) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g., 1500 (negative for refund)"
                required
              />
              <p className="text-muted-foreground text-xs">
                Use negative amount for refunds or corrections
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="employer">Employer *</Label>
              <Input
                id="employer"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
                placeholder="Company name"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDeposit.isPending}>
              {createDeposit.isPending ? 'Adding...' : 'Add Deposit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
