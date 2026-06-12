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
import { Checkbox } from '@/components/ui/checkbox';
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
  const [preserveEdits, setPreserveEdits] = useState(true);
  const resync = useForceResyncMoneytor();

  // Reset transient state whenever the dialog opens so a previous run's
  // success summary doesn't linger.
  useEffect(() => {
    if (open) {
      resync.reset();
      const { from, to } = defaultRange();
      setFromDate(from);
      setToDate(to);
      setPreserveEdits(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-close ~1.5s after a successful run so the user sees the summary.
  useEffect(() => {
    if (!resync.isSuccess) return;
    const t = setTimeout(() => onOpenChange(false), 1500);
    return () => clearTimeout(t);
  }, [resync.isSuccess, onOpenChange]);

  const canSubmit = !!fromDate && !!toDate && !resync.isPending;

  const handleSubmit = () => {
    if (!fromDate || !toDate) return;
    resync.mutate({
      from: toIsoDate(fromDate),
      to: toIsoDate(toDate),
      preserveEdits,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Force re-sync from Moneytor</DialogTitle>
          <DialogDescription>
            Replaces all transactions in the selected range with a fresh copy from Moneytor. Use
            this when Moneytor has corrected data on their side.
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

          <div className="flex items-start gap-2">
            <Checkbox
              id="force-resync-preserve"
              checked={preserveEdits}
              onCheckedChange={(v) => setPreserveEdits(v === true)}
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label htmlFor="force-resync-preserve" className="cursor-pointer">
                Keep my category, tags, and notes
              </Label>
              <p className="text-muted-foreground text-xs">
                Transactions whose Moneytor id matches an existing one keep your edits after the
                re-sync.
              </p>
            </div>
          </div>

          {resync.error && (
            <div className="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-md border p-2">
              <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-destructive text-sm">{(resync.error as Error).message}</p>
            </div>
          )}

          {resync.isSuccess && resync.data && (
            <div className="border-border bg-muted/40 rounded-md border p-2 text-sm">
              Replaced <span className="font-semibold">{resync.data.deletedMoneytor}</span>{' '}
              transactions, created{' '}
              <span className="font-semibold">{resync.data.budgetCreated}</span> fresh ones
              {preserveEdits && (
                <>
                  , preserved <span className="font-semibold">{resync.data.editsPreserved}</span>{' '}
                  edits
                </>
              )}
              .
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={resync.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {resync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Replace transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
