'use client';

import { useState, useCallback } from 'react';
import { Banknote, MoreVertical, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddCashDialog } from './add-cash-dialog';
import { EditCashDialog } from './edit-cash-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useDeleteCashBalance } from '@/lib/hooks/use-portfolio';
import type { CashBalance } from '@/lib/utils/portfolio';

interface CashBalancesSectionProps {
  accountId: string;
  cashBalances: CashBalance[];
  accountCurrency: string;
}

interface CashRowProps {
  cash: CashBalance;
  accountId: string;
  accountCurrency: string;
  onDelete: () => Promise<void>;
}

function CashRow({ cash, accountId, accountCurrency, onDelete }: CashRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Format the amount in its currency (memoized to avoid recreation on each render)
  const formatAmount = useCallback((amount: number, currency: string): string => {
    const locale = currency === 'ILS' ? 'he-IL' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  // Show converted amount if different from original
  const showConverted = cash.currency !== accountCurrency && cash.convertedAmount !== cash.amount;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        {isDeleting ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : (
          <Banknote className="text-muted-foreground h-4 w-4" />
        )}
        <span className="font-medium">{cash.currency}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <span className="tabular-nums">{formatAmount(cash.amount, cash.currency)}</span>
          {showConverted && (
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">
              ({formatAmount(cash.convertedAmount, accountCurrency)})
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              disabled={isDeleting}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Cash options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit amount
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove cash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditCashDialog
        accountId={accountId}
        cashBalance={cash}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
      <DeleteConfirmDialog
        title={`Remove ${cash.currency} cash?`}
        description={`This will remove the ${cash.currency} cash balance from this account.`}
        onConfirm={handleDelete}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </div>
  );
}

export function CashBalancesSection({
  accountId,
  cashBalances,
  accountCurrency,
}: CashBalancesSectionProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const deleteCash = useDeleteCashBalance();

  // Get existing currencies to prevent duplicates
  const existingCurrencies = cashBalances.map((cb) => cb.currency);

  return (
    <div className="border-border/50 mt-4 border-t pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-muted-foreground text-sm font-medium">Cash Balances</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="h-7 px-2"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add Cash
        </Button>
      </div>

      {cashBalances.length > 0 ? (
        <div className="divide-border/50 divide-y">
          {cashBalances.map((cash) => (
            <CashRow
              key={cash.id}
              cash={cash}
              accountId={accountId}
              accountCurrency={accountCurrency}
              onDelete={() => deleteCash.mutateAsync({ accountId, cashId: cash.id })}
            />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-col items-center py-4 text-center text-sm">
          <Banknote className="mb-2 h-8 w-8 opacity-50" />
          <p>No cash balances</p>
          <p className="text-xs">Add cash to track uninvested funds</p>
        </div>
      )}

      <AddCashDialog
        accountId={accountId}
        existingCurrencies={existingCurrencies}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </div>
  );
}
