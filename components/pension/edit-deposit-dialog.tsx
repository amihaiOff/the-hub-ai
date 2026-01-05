'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import { useUpdateDeposit } from '@/lib/hooks/use-pension';
import { getSalaryMonthOptions } from '@/lib/utils/pension';

interface EditDepositDialogProps {
  depositId: string;
  depositDate: Date | string;
  salaryMonth: Date | string;
  amount: number;
  employer: string;
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Convert dates to Date object for DatePicker
const parseDate = (date: Date | string): Date => {
  return typeof date === 'string' ? new Date(date) : date;
};

// Convert dates to string format for salary month select
const formatDateForInput = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
};

export function EditDepositDialog({
  depositId,
  depositDate: initialDepositDate,
  salaryMonth: initialSalaryMonth,
  amount: initialAmount,
  employer: initialEmployer,
  open,
  onOpenChange,
}: EditDepositDialogProps) {
  // Create a key that changes when dialog opens with new values
  const dialogKey = useMemo(
    () => `${open}-${depositId}-${initialAmount}-${initialEmployer}`,
    [open, depositId, initialAmount, initialEmployer]
  );

  const [salaryMonth, setSalaryMonth] = useState(formatDateForInput(initialSalaryMonth));
  const [depositDate, setDepositDate] = useState<Date | undefined>(parseDate(initialDepositDate));
  const [amount, setAmount] = useState(String(initialAmount));
  const [employer, setEmployer] = useState(initialEmployer);
  const [error, setError] = useState('');
  const [lastDialogKey, setLastDialogKey] = useState(dialogKey);
  const updateDeposit = useUpdateDeposit();

  const salaryMonthOptions = getSalaryMonthOptions();

  // Reset state when dialog key changes (instead of useEffect with setState)
  if (dialogKey !== lastDialogKey) {
    setSalaryMonth(formatDateForInput(initialSalaryMonth));
    setDepositDate(parseDate(initialDepositDate));
    setAmount(String(initialAmount));
    setEmployer(initialEmployer);
    setError('');
    setLastDialogKey(dialogKey);
  }

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

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    if (!employer.trim()) {
      setError('Employer name is required');
      return;
    }

    try {
      await updateDeposit.mutateAsync({
        id: depositId,
        salaryMonth,
        depositDate: format(depositDate, 'yyyy-MM-dd'),
        amount: amountNum,
        employer: employer.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deposit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Deposit</DialogTitle>
            <DialogDescription>Update deposit details.</DialogDescription>
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
              <Label htmlFor="edit-salaryMonth">Salary Month *</Label>
              <Select value={salaryMonth} onValueChange={setSalaryMonth}>
                <SelectTrigger id="edit-salaryMonth">
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
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-depositDate">Deposit Date *</Label>
              <DatePicker
                id="edit-depositDate"
                date={depositDate}
                onDateChange={setDepositDate}
                placeholder="Select deposit date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-amount">Amount (ILS) *</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g., 1500"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-employer">Employer *</Label>
              <Input
                id="edit-employer"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
                placeholder="Company name"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateDeposit.isPending}>
              {updateDeposit.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
