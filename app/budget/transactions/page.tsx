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
import { getCurrentMonth } from '@/lib/utils/budget';
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-3 sm:justify-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#ead9bd] lg:text-3xl">
            Transactions
          </h1>
          <MonthSelector selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
        </div>
        <div className="w-full max-w-lg">
          <TransactionFilters filters={filters} onFiltersChange={setFilters} />
        </div>
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

      {/* Active Filter Badges */}
      <ActiveFilterBadges filters={filters} onRemoveFilter={handleRemoveFilter} />

      {/* Transaction Count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {isLoading ? 'Loading...' : `${transactions.length} transactions`}
        </span>
        {!isLoading && (countData?.uncategorized ?? 0) > 0 && (
          <button
            className="text-destructive hover:text-destructive/80 font-medium underline-offset-2 hover:underline"
            onClick={() =>
              setFilters((prev) =>
                prev.uncategorized
                  ? { ...prev, uncategorized: undefined }
                  : { ...prev, uncategorized: true }
              )
            }
          >
            {countData?.uncategorized} uncategorized
          </button>
        )}
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
