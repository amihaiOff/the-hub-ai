'use client';

import { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { TransactionActionsPanel } from './transaction-actions-panel';
import { useDeleteTransaction, type BudgetAccountName } from '@/lib/hooks/use-budget';

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
  accountNames?: BudgetAccountName[];
  isLoading?: boolean;
}

export function TransactionTable({
  transactions,
  categoryGroups,
  payees,
  tags,
  accountNames = [],
  isLoading,
}: TransactionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<BudgetTransaction | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  // Long-press on a mobile row enters selection mode and selects that row
  const handleMobileLongPress = useCallback((id: string) => {
    setMobileSelectionMode(true);
    setSelectedIds(new Set([id]));
    setExpandedId(null);
  }, []);

  const exitMobileSelectionMode = useCallback(() => {
    setMobileSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

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
        {/* Selection mode header */}
        {mobileSelectionMode && (
          <div className="bg-primary/10 border-border/40 sticky top-0 z-10 flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button variant="ghost" size="sm" onClick={exitMobileSelectionMode}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}
        {dateGroups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground border-border shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium">
                {formatDate(group.date)}
              </span>
              <div className="bg-border h-px flex-1" />
            </div>
            {group.transactions.map((transaction) => {
              const isExpanded = expandedId === transaction.id;
              return (
                <div key={transaction.id}>
                  <TransactionRowMobile
                    transaction={transaction}
                    categoryGroups={categoryGroups}
                    payees={payees}
                    tags={tags}
                    isSelected={selectedIds.has(transaction.id)}
                    selectionMode={mobileSelectionMode}
                    isExpanded={isExpanded}
                    onSelect={(selected) => toggleSelect(transaction.id, selected)}
                    onLongPress={() => handleMobileLongPress(transaction.id)}
                    onTap={() =>
                      setExpandedId((prev) => (prev === transaction.id ? null : transaction.id))
                    }
                    onEdit={() => setEditingTransaction(transaction)}
                    onDelete={() => handleDelete(transaction.id)}
                    onSplit={() => setSplittingTransaction(transaction)}
                    onPromptPayeeCategory={setPayeeCategoryPrompt}
                  />
                  {isExpanded && (
                    <TransactionActionsPanel
                      transaction={transaction}
                      categoryGroups={categoryGroups}
                      payees={payees}
                      tags={tags}
                      accountNames={accountNames}
                      onEdit={() => {
                        setEditingTransaction(transaction);
                        setExpandedId(null);
                      }}
                      onSplit={() => {
                        setSplittingTransaction(transaction);
                        setExpandedId(null);
                      }}
                      onDelete={() => {
                        setExpandedId(null);
                        handleDelete(transaction.id);
                      }}
                      onPromptPayeeCategory={setPayeeCategoryPrompt}
                    />
                  )}
                </div>
              );
            })}
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
          onClearSelection={exitMobileSelectionMode}
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
