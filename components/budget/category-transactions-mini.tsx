'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type BudgetTransaction,
  type BudgetPayee,
  formatDate,
  formatCurrencyILS,
  getPayeeName,
} from '@/lib/utils/budget';

const PAGE_SIZE = 10;

interface CategoryTransactionsMiniProps {
  transactions: BudgetTransaction[];
  payees: BudgetPayee[];
  emptyMessage?: string;
}

export function CategoryTransactionsMini({
  transactions,
  payees,
  emptyMessage = 'No transactions in this category',
}: CategoryTransactionsMiniProps) {
  const [page, setPage] = useState(0);

  if (transactions.length === 0) {
    return <div className="text-muted-foreground py-4 text-center text-sm">{emptyMessage}</div>;
  }

  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
  );

  const totalPages = Math.ceil(sortedTransactions.length / PAGE_SIZE);
  const pageTransactions = sortedTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th scope="col" className="pr-4 pb-1 text-left font-medium">
              Date
            </th>
            <th scope="col" className="pr-4 pb-1 text-left font-medium">
              Payee
            </th>
            <th scope="col" className="hidden pr-4 pb-1 text-left font-medium lg:table-cell">
              Notes
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {pageTransactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-muted/30">
              <td className="text-muted-foreground py-1 pr-4 tabular-nums">
                {formatDate(tx.transactionDate)}
              </td>
              <td className="max-w-[150px] truncate py-1 pr-4">
                {getPayeeName(tx.payeeId, payees)}
              </td>
              <td className="text-muted-foreground hidden max-w-[150px] truncate py-1 pr-4 lg:table-cell">
                {tx.notes || '—'}
              </td>
              <td className="py-1 text-right tabular-nums">
                <span className={tx.type === 'income' ? 'text-green-500' : ''}>
                  {tx.type === 'income' ? '+' : '-'}
                  {formatCurrencyILS(tx.amountIls)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
