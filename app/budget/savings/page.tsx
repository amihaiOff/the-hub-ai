'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, AlertCircle, PiggyBank } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useSavings, useAddSavingsEntry } from '@/lib/hooks/use-budget';
import { formatCurrencyILS, formatMonth, getCurrentMonth } from '@/lib/utils/budget';

export default function SavingsPage() {
  const { data, isLoading, error } = useSavings();
  const addEntry = useAddSavingsEntry();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(getCurrentMonth());
  const [amount, setAmount] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Math.round(parseFloat(amount) * 100) / 100;
    if (!month || isNaN(numAmount) || numAmount <= 0) return;

    try {
      await addEntry.mutateAsync({ month, amount: numAmount });
      setOpen(false);
      setAmount('');
    } catch {
      // Error shown inline via addEntry.isError
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Savings</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Savings Entry</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="month">Month</Label>
                <Input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (ILS)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              {addEntry.isError && (
                <p className="text-destructive text-sm">
                  {addEntry.error instanceof Error ? addEntry.error.message : 'Failed to add entry'}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={addEntry.isPending}>
                {addEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Entry
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load savings</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && data && data.years.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16">
          <PiggyBank className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground text-sm">No savings entries yet</p>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add your first entry
          </Button>
        </div>
      )}

      {/* Year-Grouped Table */}
      {!isLoading && data && data.years.length > 0 && (
        <div className="lg:border-border/40 lg:bg-card/80 lg:shadow-glow lg:rounded-3xl lg:border lg:py-6 lg:backdrop-blur-xl">
          <div className="space-y-0">
            {data.years.map((yearData) => (
              <div key={yearData.year}>
                {/* Year Header */}
                <div className="bg-muted/30 flex items-center justify-between px-4 py-3 lg:px-6">
                  <span className="text-sm font-bold">{yearData.year}</span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatCurrencyILS(yearData.total)}
                  </span>
                </div>

                {/* Month Rows */}
                {yearData.months.map((monthData) => (
                  <div
                    key={monthData.month}
                    className="border-border/10 flex items-center justify-between border-b px-4 py-2.5 last:border-b-0 lg:px-6"
                  >
                    <span className="text-muted-foreground text-sm">
                      {formatMonth(monthData.month)}
                    </span>
                    <span className="text-sm tabular-nums">
                      {monthData.amount === 0 ? (
                        <span className="text-muted-foreground/50">&mdash;</span>
                      ) : (
                        formatCurrencyILS(monthData.amount)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
