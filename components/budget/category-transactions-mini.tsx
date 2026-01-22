'use client';

import {
  type BudgetTransaction,
  type BudgetPayee,
  formatDate,
  formatCurrencyILS,
  getPayeeName,
} from '@/lib/utils/budget';

interface CategoryTransactionsMiniProps {
  transactions: BudgetTransaction[];
  payees: BudgetPayee[];
}

export function CategoryTransactionsMini({ transactions, payees }: CategoryTransactionsMiniProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        No transactions in this category
      </div>
    );
  }

  // Sort by date descending and limit to 5
  const sortedTransactions = [...transactions]
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="text-muted-foreground grid grid-cols-[1fr,auto] gap-2 px-2 text-xs font-medium sm:grid-cols-[80px,1fr,auto]">
        <span className="hidden sm:block">Date</span>
        <span>Payee</span>
        <span className="text-right">Amount</span>
      </div>

      {/* Transactions */}
      {sortedTransactions.map((tx) => (
        <div
          key={tx.id}
          className="hover:bg-muted/50 grid grid-cols-[1fr,auto] gap-2 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[80px,1fr,auto]"
        >
          <span className="text-muted-foreground hidden tabular-nums sm:block">
            {formatDate(tx.transactionDate)}
          </span>
          <span className="truncate">
            <span className="text-muted-foreground mr-2 text-xs sm:hidden">
              {formatDate(tx.transactionDate)}
            </span>
            {getPayeeName(tx.payeeId, payees)}
          </span>
          <span className="text-right tabular-nums">
            {tx.type === 'income' ? '+' : '-'}
            {formatCurrencyILS(tx.amountIls)}
          </span>
        </div>
      ))}

      {/* Show more indicator */}
      {transactions.length > 5 && (
        <div className="text-muted-foreground px-2 text-center text-xs">
          +{transactions.length - 5} more transactions
        </div>
      )}
    </div>
  );
}
