'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, AlertCircle, History, Plus, Sparkles, Loader2 } from 'lucide-react';
import {
  useTransactions,
  useCategoryGroups,
  usePayees,
  useTags,
  useUncategorizedCount,
  useAccountNames,
  useSelectedMonth,
  useSuggestCategories,
  type TransactionFilters as FilterType,
} from '@/lib/hooks/use-budget';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';
import {
  TransactionTable,
  TransactionFilters,
  ActiveFilterBadges,
  ImportCsvDialog,
  MonthSelector,
  AddTransactionDialog,
} from '@/components/budget';
import { ForceResyncDialog } from '@/components/moneytor/force-resync-dialog';

export default function TransactionsPage() {
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showForceResync, setShowForceResync] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [filters, setFilters] = useState<FilterType>({});
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();
  const suggest = useSuggestCategories();

  const handleSuggest = () => {
    setSuggestMsg(null);
    suggest.mutate(undefined, {
      onSuccess: (r) => {
        const parts = [`${r.suggested} suggested`];
        if (r.lowConfidence) parts.push(`${r.lowConfidence} low-confidence`);
        if (r.noMatch) parts.push(`${r.noMatch} no match`);
        if (r.errors) parts.push(`${r.errors} errors`);
        setSuggestMsg(
          r.processed === 0
            ? 'No uncategorized transactions to analyze.'
            : `Analyzed ${r.processed}: ${parts.join(', ')}. See the log in Settings.`
        );
        // Reveal the yellow-bordered suggestions.
        if (r.suggested > 0) setFilters((prev) => ({ ...prev, uncategorized: true }));
      },
      onError: (e) => setSuggestMsg(e instanceof Error ? e.message : 'Failed to run suggestions.'),
    });
  };

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
      <h1 className="page-title text-5xl font-bold tracking-tight lg:text-6xl">Transactions</h1>
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
          <p className="mt-0.5 text-base font-bold text-[#d4b878] tabular-nums sm:text-xl">
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

      {/* Search + actions on one row — small icon buttons hug the right, search fills the rest */}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <TransactionFilters filters={filters} onFiltersChange={setFilters} />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setShowAddTransaction(true)}
          title="Add transaction"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleSuggest}
          disabled={suggest.isPending}
          title="Suggest categories for uncategorized transactions with AI"
        >
          {suggest.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setShowForceResync(true)}
          title="Force re-sync a date range from Moneytor"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setShowImportCsv(true)}
          title="Import CSV"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* AI suggestion result banner */}
      {suggestMsg && (
        <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <span className="flex-1">{suggestMsg}</span>
          <button
            type="button"
            onClick={() => setSuggestMsg(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Filter Badges */}
      <ActiveFilterBadges filters={filters} onRemoveFilter={handleRemoveFilter} />

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
