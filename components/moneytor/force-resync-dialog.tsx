'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/budget/analysis/date-range-picker';
import { useForceResyncMoneytor } from '@/lib/hooks/use-moneytor';

interface ForceResyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return { from, to };
}

export function ForceResyncDialog({ open, onOpenChange }: ForceResyncDialogProps) {
  const [{ from: initialFrom, to: initialTo }] = useState(defaultRange);
  const [fromDate, setFromDate] = useState<Date | undefined>(initialFrom);
  const [toDate, setToDate] = useState<Date | undefined>(initialTo);
  const resync = useForceResyncMoneytor();

  // Reset transient state whenever the dialog opens so a previous run's
  // success summary doesn't linger.
  useEffect(() => {
    if (open) {
      resync.reset();
      const { from, to } = defaultRange();
      setFromDate(from);
      setToDate(to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = !!fromDate && !!toDate && !resync.isPending;

  const handleSubmit = () => {
    if (!fromDate || !toDate) return;
    resync.mutate({
      from: toIsoDate(fromDate),
      to: toIsoDate(toDate),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Force re-sync from Moneytor</DialogTitle>
          <DialogDescription>
            Replaces all transactions in the selected range with a fresh copy from Moneytor. Matches
            by description, date, amount and account, so your category, tags and notes stay attached
            even if Moneytor reassigns the underlying id.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Date range</Label>
            <DateRangePicker
              startDate={fromDate}
              endDate={toDate}
              onStartDateChange={setFromDate}
              onEndDateChange={setToDate}
            />
            <p className="text-muted-foreground text-xs">Default: last 7 days.</p>
          </div>

          {resync.error && (
            <div className="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-md border p-2">
              <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-destructive text-sm">{(resync.error as Error).message}</p>
            </div>
          )}

          {resync.isSuccess && resync.data && (
            <div className="border-border bg-muted/40 rounded-md border p-2 text-sm">
              Fetched <span className="font-semibold">{resync.data.fetched}</span>, kept{' '}
              <span className="font-semibold">{resync.data.editsPreserved}</span> existing, created{' '}
              <span className="font-semibold">{resync.data.budgetCreated}</span> new
              {resync.data.deletedBudget > 0 && (
                <>
                  , dropped <span className="font-semibold">{resync.data.deletedBudget}</span>{' '}
                  orphaned
                </>
              )}
              .
            </div>
          )}
        </div>

        <DialogFooter>
          {resync.isSuccess ? (
            // After a successful run, swap the action buttons for a single
            // dismiss so the user controls when to close — the summary stays
            // on screen until they acknowledge it.
            <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              OK
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={resync.isPending}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
                {resync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Replace transactions
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
