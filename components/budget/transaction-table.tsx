'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetPayee,
  type BudgetTag,
  formatDate,
} from '@/lib/utils/budget';
import {
  TransactionRow,
  TransactionRowMobile,
  type PayeeCategoryPromptData,
} from './transaction-row';
import { BulkActionsBar } from './bulk-actions-bar';
import { EditTransactionDialog } from './edit-transaction-dialog';
import { SplitTransactionDialog } from './split-transaction-dialog';
import { PayeeCategoryPrompt } from './payee-category-prompt';
import { useDeleteTransaction } from '@/lib/hooks/use-budget';

function groupTransactionsByDate(transactions: BudgetTransaction[]) {
  const groups: { date: string; transactions: BudgetTransaction[] }[] = [];
  let currentDate = '';
  for (const t of transactions) {
    const date = t.transactionDate.slice(0, 10);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, transactions: [t] });
    } else {
      groups[groups.length - 1].transactions.push(t);
    }
  }
  return groups;
}

interface TransactionTableProps {
  transactions: BudgetTransaction[];
  categoryGroups: BudgetCategoryGroup[];
  payees: BudgetPayee[];
  tags: BudgetTag[];
  isLoading?: boolean;
}

export function TransactionTable({
  transactions,
  categoryGroups,
  payees,
  tags,
  isLoading,
}: TransactionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<BudgetTransaction | null>(null);
  const [payeeCategoryPrompt, setPayeeCategoryPrompt] = useState<PayeeCategoryPromptData | null>(
    null
  );
  const deleteTransaction = useDeleteTransaction();
  const dateGroups = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const toggleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this transaction?')) {
      try {
        await deleteTransaction.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete transaction:', error);
      }
    }
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">No transactions found</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Try adjusting your filters or add a new transaction
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Mobile: grouped by date */}
      <div className="sm:hidden">
        {dateGroups.map((group, groupIndex) => (
          <div key={group.date}>
            <div className="text-muted-foreground bg-muted/30 flex items-center gap-2 border-b px-2 py-1.5 text-xs font-medium">
              {groupIndex === 0 && (
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                  className="h-3.5 w-3.5"
                />
              )}
              {formatDate(group.date)}
            </div>
            {group.transactions.map((transaction) => (
              <TransactionRowMobile
                key={transaction.id}
                transaction={transaction}
                categoryGroups={categoryGroups}
                payees={payees}
                tags={tags}
                isSelected={selectedIds.has(transaction.id)}
                onSelect={(selected) => toggleSelect(transaction.id, selected)}
                onEdit={() => setEditingTransaction(transaction)}
                onDelete={() => handleDelete(transaction.id)}
                onSplit={() => setSplittingTransaction(transaction)}
                onPromptPayeeCategory={setPayeeCategoryPrompt}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block">
        <div className="lg:border-border lg:bg-card overflow-hidden lg:rounded-lg lg:border lg:py-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="w-10 px-4 py-3 text-left">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Date
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Payee
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                    Category
                  </th>
                  <th className="text-muted-foreground hidden px-4 py-3 text-left text-xs font-medium tracking-wider uppercase lg:table-cell">
                    Tags
                  </th>
                  <th className="text-muted-foreground px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                    Amount
                  </th>
                  <th className="w-10 px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categoryGroups={categoryGroups}
                    payees={payees}
                    tags={tags}
                    isSelected={selectedIds.has(transaction.id)}
                    onSelect={(selected) => toggleSelect(transaction.id, selected)}
                    onEdit={() => setEditingTransaction(transaction)}
                    onDelete={() => handleDelete(transaction.id)}
                    onSplit={() => setSplittingTransaction(transaction)}
                    onPromptPayeeCategory={setPayeeCategoryPrompt}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {/* Edit Dialog */}
      <EditTransactionDialog
        transaction={editingTransaction}
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
      />

      {/* Split Dialog */}
      <SplitTransactionDialog
        transaction={splittingTransaction}
        open={!!splittingTransaction}
        onOpenChange={(open) => !open && setSplittingTransaction(null)}
      />

      {/* Payee Category Prompt - lifted here so it survives row unmount */}
      {payeeCategoryPrompt && (
        <PayeeCategoryPrompt
          open={!!payeeCategoryPrompt}
          onClose={() => setPayeeCategoryPrompt(null)}
          payeeId={payeeCategoryPrompt.payeeId}
          payeeName={payeeCategoryPrompt.payeeName}
          categoryId={payeeCategoryPrompt.categoryId}
          categoryName={payeeCategoryPrompt.categoryName}
          oldDefaultCategoryName={payeeCategoryPrompt.oldDefaultCategoryName}
        />
      )}
    </div>
  );
}
