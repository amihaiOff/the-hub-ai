'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatCurrencyILSPrecise } from '@/lib/utils/budget';
import type { MoneytorTransactionRow } from '@/lib/hooks/use-moneytor';

interface MoneytorTransactionTableProps {
  transactions: MoneytorTransactionRow[];
  isLoading: boolean;
}

function amountClass(amount: number) {
  if (amount > 0) return 'text-green-600 dark:text-green-400';
  if (amount < 0) return 'text-red-600 dark:text-red-400';
  return '';
}

function formatAmount(amount: number, currency: string): string {
  if (currency === 'ILS') return formatCurrencyILSPrecise(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function MoneytorTransactionTable({
  transactions,
  isLoading,
}: MoneytorTransactionTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Loading transactions...
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          No transactions to show. Click <span className="font-medium">Sync now</span> to pull from
          Moneytor.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Mobile view: stacked cards */}
      <div className="space-y-2 md:hidden">
        {transactions.map((tx) => (
          <Card key={tx.id}>
            <CardContent className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tx.description}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatDate(tx.transactionDate)}
                  </div>
                </div>
                <div className={cn('shrink-0 text-sm font-semibold', amountClass(tx.amount))}>
                  {formatAmount(tx.amount, tx.currency)}
                </div>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span>{tx.category}</span>
                <span>{tx.type}</span>
                <span className="truncate">acct: {tx.accountId.slice(0, 12)}…</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop view: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(tx.transactionDate)}
                  </TableCell>
                  <TableCell className="font-medium">{tx.description}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{tx.category}</TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-[160px] truncate text-xs"
                    title={tx.accountId}
                  >
                    {tx.accountId.slice(0, 12)}…
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{tx.type}</TableCell>
                  <TableCell
                    className={cn('text-right font-semibold tabular-nums', amountClass(tx.amount))}
                  >
                    {formatAmount(tx.amount, tx.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
