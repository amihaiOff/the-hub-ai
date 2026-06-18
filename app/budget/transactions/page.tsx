'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Upload, AlertCircle, RefreshCw, History } from 'lucide-react';
import {
  useTransactions,
  useCategoryGroups,
  usePayees,
  useTags,
  useUncategorizedCount,
  useSyncMoneytor,
  useAccountNames,
  type TransactionFilters as FilterType,
} from '@/lib/hooks/use-budget';
import { getCurrentMonth, formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';
import {
  TransactionTable,
  AddTransactionDialog,
  TransactionFilters,
  ActiveFilterBadges,
  ImportCsvDialog,
  MonthSelector,
} from '@/components/budget';
import { ForceResyncDialog } from '@/components/moneytor/force-resync-dialog';

export default function TransactionsPage() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showForceResync, setShowForceResync] = useState(false);
  const [filters, setFilters] = useState<FilterType>({});
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const {
    data: transactions = [],
    isLoading,
    error,
  } = useTransactions({ ...filters, month: selectedMonth });
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: tags = [] } = useTags();
  const { data: accountNames = [] } = useAccountNames();
  const { data: countData } = useUncategorizedCount(selectedMonth);
  const syncMoneytor = useSyncMoneytor();

  const handleRemoveFilter = (key: keyof FilterType) => {
    setFilters((prev) => ({ ...prev, [key]: undefined }));
  };

  const sum = transactions.reduce(
    (acc, tx) => acc + (tx.type === 'income' ? tx.amountIls : -tx.amountIls),
    0
  );
  const uncategorizedCount = countData?.uncategorized ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — just the (chromeless) month picker, centered */}
      <div className="flex w-full items-center justify-center">
        <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load transactions</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Moneytor Sync Feedback */}
      {syncMoneytor.isError && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="text-destructive h-5 w-5 shrink-0" />
            <p className="text-destructive text-sm">
              Moneytor sync failed:{' '}
              {syncMoneytor.error instanceof Error
                ? syncMoneytor.error.message
                : 'Unexpected error'}
            </p>
          </CardContent>
        </Card>
      )}
      {syncMoneytor.isSuccess && (
        <Card className="border-green-600/40">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-green-600">Moneytor synced.</span>{' '}
            <span className="text-muted-foreground">
              {syncMoneytor.data.fetched} fetched · {syncMoneytor.data.budgetCreated} new
              transactions · {syncMoneytor.data.budgetSkipped} skipped
              {syncMoneytor.data.latestDate ? ` · latest ${syncMoneytor.data.latestDate}` : ''}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Stats — same shape & density as the Overview BudgetSummary card */}
      <div className="bg-card divide-border border-border flex items-center divide-x rounded-lg border px-1 py-3 sm:py-4">
        {/* Transaction count */}
        <div className="flex-1 text-center">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
            # trnx
          </p>
          <p className="mt-0.5 text-base font-bold tabular-nums sm:text-xl">
            {isLoading ? '—' : transactions.length}
          </p>
        </div>

        {/* Net sum — same blue as the Overview Income/Net values */}
        <div className="flex-1 text-center">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
            Sum
          </p>
          <p className="mt-0.5 text-base font-bold text-[#6ab2ff] tabular-nums sm:text-xl">
            {isLoading
              ? '—'
              : transactions.length === 0
                ? '—'
                : `${sum >= 0 ? '+' : ''}${formatCurrencyILS(Math.abs(sum))}`}
          </p>
        </div>

        {/* Uncategorized — clickable filter shortcut */}
        <button
          className={cn(
            'flex-1 text-center transition-opacity',
            uncategorizedCount === 0 && 'opacity-40',
            uncategorizedCount > 0 && 'cursor-pointer hover:opacity-80'
          )}
          disabled={uncategorizedCount === 0}
          onClick={() =>
            uncategorizedCount > 0 &&
            setFilters((prev) =>
              prev.uncategorized
                ? { ...prev, uncategorized: undefined }
                : { ...prev, uncategorized: true }
            )
          }
        >
          <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-xs">
            Uncategorized
          </p>
          <p
            className={cn(
              'mt-0.5 text-base font-bold tabular-nums sm:text-xl',
              uncategorizedCount > 0 && 'text-destructive'
            )}
          >
            {isLoading ? '—' : uncategorizedCount}
          </p>
        </button>
      </div>

      {/* Search / filters */}
      <div className="mx-auto w-full max-w-lg">
        <TransactionFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Active Filter Badges */}
      <ActiveFilterBadges filters={filters} onRemoveFilter={handleRemoveFilter} />

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => syncMoneytor.mutate()}
          disabled={syncMoneytor.isPending}
          title="Sync with Moneytor"
        >
          <RefreshCw className={`h-4 w-4 ${syncMoneytor.isPending ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setShowForceResync(true)}
          title="Force re-sync a date range from Moneytor"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setShowImportCsv(true)}
          title="Import CSV"
        >
          <Upload className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setShowAddTransaction(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Transaction Table */}
      <TransactionTable
        transactions={transactions}
        categoryGroups={categoryGroups}
        payees={payees}
        tags={tags}
        accountNames={accountNames}
        isLoading={isLoading}
      />

      {/* Add Transaction Dialog */}
      <AddTransactionDialog open={showAddTransaction} onOpenChange={setShowAddTransaction} />

      {/* Import CSV Dialog */}
      <ImportCsvDialog open={showImportCsv} onOpenChange={setShowImportCsv} />

      {/* Force Re-sync Dialog */}
      <ForceResyncDialog open={showForceResync} onOpenChange={setShowForceResync} />
    </div>
  );
}
