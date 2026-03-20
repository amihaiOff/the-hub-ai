'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Building2,
  MoreVertical,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoldingsTable } from './holdings-table';
import { CashBalancesSection } from './cash-balances-section';
import { AccountSparkline, type SparklineTimespan } from './account-sparkline';
import { AddHoldingDialog } from './add-holding-dialog';
import { EditAccountDialog } from './edit-account-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { OwnerBadges } from '@/components/shared/owner-badges';
import { useDeleteAccount } from '@/lib/hooks/use-portfolio';
import { formatPercent, getCurrencySymbol } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import { cn } from '@/lib/utils';
import type { AccountSummary } from '@/lib/utils/portfolio';

const TIMESPAN_OPTIONS: { value: SparklineTimespan; label: string }[] = [
  { value: '1W', label: '1 week' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: '1Y', label: '1 year' },
  { value: 'ALL', label: 'all time' },
];

interface AccountCardProps {
  account: AccountSummary;
}

export function AccountCard({ account }: AccountCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showInAlternate, setShowInAlternate] = useState(false);
  const [showAddHoldingDialog, setShowAddHoldingDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [timespan, setTimespan] = useState<SparklineTimespan>('ALL');
  const deleteAccount = useDeleteAccount();
  const { rates, isLoadingRates, ratesError } = useCurrency();
  const isPositive = account.totalGainLoss >= 0;

  const nativeCurrency = account.currency || 'USD';
  const alternateCurrency = nativeCurrency === 'ILS' ? 'USD' : 'ILS';
  const displayCurrency = showInAlternate ? alternateCurrency : nativeCurrency;

  const nativeFormatter = useMemo(
    () =>
      new Intl.NumberFormat(nativeCurrency === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: nativeCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [nativeCurrency]
  );

  const alternateFormatter = useMemo(
    () =>
      new Intl.NumberFormat(alternateCurrency === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: alternateCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [alternateCurrency]
  );

  const formatDisplayValue = useCallback(
    (value: number): string => {
      if (showInAlternate && rates) {
        let convertedValue: number;
        if (nativeCurrency === 'ILS' && alternateCurrency === 'USD') {
          convertedValue = value / (rates.USD || 1);
        } else {
          const rate = rates[nativeCurrency as keyof typeof rates] || rates.USD || 1;
          convertedValue = value * rate;
        }
        return alternateFormatter.format(convertedValue);
      }

      return nativeFormatter.format(value);
    },
    [showInAlternate, rates, nativeCurrency, alternateCurrency, nativeFormatter, alternateFormatter]
  );

  const toggleDisabled = isLoadingRates || !!ratesError;
  const selectedTimespanLabel =
    TIMESPAN_OPTIONS.find((o) => o.value === timespan)?.label ?? 'all time';

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="relative p-0">
          <div className="relative z-10 px-4 pt-4 sm:px-6 sm:pt-5">
            {/* Row 1: Account name + broker + owners (left) | actions (right) */}
            <div className="flex items-start justify-between">
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center gap-2 text-left hover:opacity-80"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${account.name} account details`}
                >
                  {isOpen ? (
                    <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
                      {account.name}
                    </p>
                    <div className="flex items-center gap-2">
                      {account.broker && (
                        <span className="text-muted-foreground/60 flex items-center gap-1 text-xs">
                          <Building2 className="h-3 w-3" />
                          {account.broker}
                        </span>
                      )}
                      {account.owners && account.owners.length > 0 && (
                        <OwnerBadges owners={account.owners} size="xs" />
                      )}
                    </div>
                  </div>
                </button>
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Account options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowAddHoldingDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add holding
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Large value */}
            <div className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
              {formatDisplayValue(account.totalValue)}
            </div>

            {/* Gain/loss badge + timespan dropdown + currency toggle */}
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  isPositive ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400'
                )}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {formatPercent(account.totalGainLossPercent)}
              </span>

              {/* Timespan dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground cursor-pointer text-xs transition-colors">
                    {selectedTimespanLabel}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {TIMESPAN_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => setTimespan(opt.value)}
                      className={cn(timespan === opt.value && 'bg-muted')}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Currency toggle - small, next to timespan */}
              <div
                role="group"
                aria-label="Display currency"
                className="bg-muted/50 ml-auto flex items-center gap-0.5 rounded-md border p-0.5"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInAlternate(false)}
                  aria-pressed={!showInAlternate}
                  className={cn(
                    'h-5 px-1.5 text-[10px] font-medium',
                    !showInAlternate ? 'bg-background shadow-sm' : 'hover:bg-transparent'
                  )}
                >
                  {getCurrencySymbol(nativeCurrency)}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInAlternate(true)}
                  disabled={toggleDisabled}
                  aria-pressed={showInAlternate}
                  className={cn(
                    'h-5 px-1.5 text-[10px] font-medium',
                    showInAlternate ? 'bg-background shadow-sm' : 'hover:bg-transparent',
                    toggleDisabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {getCurrencySymbol(alternateCurrency)}
                </Button>
              </div>
            </div>
          </div>

          {/* Sparkline — px matches the table padding */}
          <div className="mt-2 h-16 w-full px-4 sm:h-20 sm:px-6">
            <AccountSparkline
              currentValue={account.totalValue}
              totalGainLoss={account.totalGainLoss}
              timespan={timespan}
              formatValue={formatDisplayValue}
            />
          </div>

          {/* Dialogs */}
          <AddHoldingDialog
            accountId={account.id}
            accountName={account.name}
            accountCurrency={nativeCurrency}
            open={showAddHoldingDialog}
            onOpenChange={setShowAddHoldingDialog}
          />
          <EditAccountDialog
            accountId={account.id}
            accountName={account.name}
            accountBroker={account.broker}
            accountCurrency={nativeCurrency}
            currentOwnerIds={account.owners?.map((o) => o.id) ?? []}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          />
          <DeleteConfirmDialog
            title={`Delete ${account.name}?`}
            description={`This will permanently delete the account "${account.name}" and all its holdings. This action cannot be undone.`}
            onConfirm={() => deleteAccount.mutateAsync(account.id)}
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          />
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-4">
            <HoldingsTable
              holdings={account.holdings}
              baseCurrency={nativeCurrency}
              displayCurrency={displayCurrency}
            />
            <CashBalancesSection
              accountId={account.id}
              cashBalances={account.cashBalances}
              accountCurrency={nativeCurrency}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
