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
            <th scope="col" className="hidden pr-4 pb-1 text-left font-medium sm:table-cell">
              Method
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
          {sortedTransactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-muted/30">
              <td className="text-muted-foreground py-1 pr-4 tabular-nums">
                {formatDate(tx.transactionDate)}
              </td>
              <td className="max-w-[150px] truncate py-1 pr-4">
                {getPayeeName(tx.payeeId, payees)}
              </td>
              <td className="text-muted-foreground hidden py-1 pr-4 sm:table-cell">
                {tx.paymentMethod}
                {tx.totalPayments && tx.totalPayments > 1 && (
                  <span className="ml-1 text-xs">
                    ({tx.paymentNumber}/{tx.totalPayments})
                  </span>
                )}
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

      {/* Show more indicator */}
      {transactions.length > 5 && (
        <div className="text-muted-foreground mt-2 text-center text-xs">
          +{transactions.length - 5} more transactions
        </div>
      )}
    </div>
  );
}
