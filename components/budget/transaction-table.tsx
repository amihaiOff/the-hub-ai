'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetPayee,
  type BudgetTag,
} from '@/lib/utils/budget';
import { TransactionRow } from './transaction-row';
import { BulkActionsBar } from './bulk-actions-bar';
import { EditTransactionDialog } from './edit-transaction-dialog';
import { SplitTransactionDialog } from './split-transaction-dialog';
import { useDeleteTransaction } from '@/lib/hooks/use-budget';

interface TransactionTableProps {
  transactions: BudgetTransaction[];
  categoryGroups: BudgetCategoryGroup[];
  payees: BudgetPayee[];
  tags: BudgetTag[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function TransactionTable({
  transactions,
  categoryGroups,
  payees,
  tags,
  isLoading,
  hasMore,
  onLoadMore,
}: TransactionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<BudgetTransaction | null>(null);
  const deleteTransaction = useDeleteTransaction();

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
      <div className="lg:border-border/40 lg:bg-card/80 lg:shadow-glow overflow-hidden lg:rounded-3xl lg:border lg:py-6 lg:backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-10 px-2 py-3 text-left sm:px-4">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="text-muted-foreground hidden px-2 py-3 text-left text-xs font-medium tracking-wider uppercase sm:table-cell sm:px-4">
                  Date
                </th>
                <th className="text-muted-foreground px-2 py-3 text-left text-xs font-medium tracking-wider uppercase sm:px-4">
                  Payee
                </th>
                <th className="text-muted-foreground hidden px-2 py-3 text-left text-xs font-medium tracking-wider uppercase sm:table-cell sm:px-4">
                  Category
                </th>
                <th className="text-muted-foreground hidden px-2 py-3 text-left text-xs font-medium tracking-wider uppercase lg:table-cell lg:px-4">
                  Tags
                </th>
                <th className="text-muted-foreground px-2 py-3 text-right text-xs font-medium tracking-wider uppercase sm:px-4">
                  Amount
                </th>
                <th className="w-10 px-2 py-3 sm:px-4">
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
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {hasMore && (
          <div className="border-t p-4 text-center">
            <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}
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
    </div>
  );
}
