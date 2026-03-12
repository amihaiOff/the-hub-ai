'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Upload, AlertCircle } from 'lucide-react';
import {
  useTransactions,
  useCategoryGroups,
  usePayees,
  useTags,
  useUncategorizedCount,
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

export default function TransactionsPage() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
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
  const { data: countData } = useUncategorizedCount(selectedMonth);

  const handleRemoveFilter = (key: keyof FilterType) => {
    setFilters((prev) => ({ ...prev, [key]: undefined }));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Transactions</h1>
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

      {/* Search, Filters & Add */}
      <div className="flex items-center gap-2">
        <TransactionFilters filters={filters} onFiltersChange={setFilters} />
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

      {/* Active Filter Badges */}
      <ActiveFilterBadges filters={filters} onRemoveFilter={handleRemoveFilter} />

      {/* Transaction Count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {isLoading ? 'Loading...' : `${transactions.length} transactions`}
        </span>
        {!isLoading && (countData?.uncategorized ?? 0) > 0 && (
          <span className="text-destructive font-medium">
            {countData?.uncategorized} uncategorized
          </span>
        )}
      </div>

      {/* Transaction Table */}
      <TransactionTable
        transactions={transactions}
        categoryGroups={categoryGroups}
        payees={payees}
        tags={tags}
        isLoading={isLoading}
      />

      {/* Add Transaction Dialog */}
      <AddTransactionDialog open={showAddTransaction} onOpenChange={setShowAddTransaction} />

      {/* Import CSV Dialog */}
      <ImportCsvDialog open={showImportCsv} onOpenChange={setShowImportCsv} />
    </div>
  );
}
