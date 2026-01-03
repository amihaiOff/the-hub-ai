'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoldingsTable } from './holdings-table';
import { AddHoldingDialog } from './add-holding-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useDeleteAccount } from '@/lib/hooks/use-portfolio';
import { formatPercent } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import { cn } from '@/lib/utils';
import type { AccountSummary } from '@/lib/utils/portfolio';

interface AccountCardProps {
  account: AccountSummary;
}

export function AccountCard({ account }: AccountCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  // Display currency: either account's native currency or alternate (ILS/USD)
  const [showInAlternate, setShowInAlternate] = useState(false);
  const deleteAccount = useDeleteAccount();
  const { rates, isLoadingRates, ratesError } = useCurrency();
  const isPositive = account.totalGainLoss >= 0;

  // Determine the alternate currency (if account is USD, alternate is ILS; if account is ILS, alternate is USD)
  const nativeCurrency = account.currency || 'USD';
  const alternateCurrency = nativeCurrency === 'ILS' ? 'USD' : 'ILS';
  const displayCurrency = showInAlternate ? alternateCurrency : nativeCurrency;

  // Format value in the selected display currency
  // Note: rates are TO ILS (e.g., rates.USD = 3.18 means 1 USD = 3.18 ILS)
  const formatDisplayValue = (value: number): string => {
    if (showInAlternate && rates) {
      let convertedValue: number;
      if (nativeCurrency === 'ILS' && alternateCurrency === 'USD') {
        // Convert ILS to USD: divide by USD-to-ILS rate
        convertedValue = value / (rates.USD || 1);
      } else {
        // Convert native currency to ILS: multiply by the currency's rate to ILS
        const rate = rates[nativeCurrency as keyof typeof rates] || rates.USD || 1;
        convertedValue = value * rate;
      }
      return new Intl.NumberFormat(alternateCurrency === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: alternateCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(convertedValue);
    }

    return new Intl.NumberFormat(nativeCurrency === 'ILS' ? 'he-IL' : 'en-US', {
      style: 'currency',
      currency: nativeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const toggleDisabled = isLoadingRates || !!ratesError;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left hover:opacity-80">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                  {account.broker && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {account.broker}
                    </div>
                  )}
                </div>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {/* Currency toggle */}
              <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInAlternate(false)}
                  className={cn(
                    'h-6 px-2 text-xs font-medium',
                    !showInAlternate
                      ? 'bg-background shadow-sm'
                      : 'hover:bg-transparent'
                  )}
                >
                  {nativeCurrency}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInAlternate(true)}
                  disabled={toggleDisabled}
                  className={cn(
                    'h-6 px-2 text-xs font-medium',
                    showInAlternate
                      ? 'bg-background shadow-sm'
                      : 'hover:bg-transparent',
                    toggleDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {alternateCurrency}
                </Button>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">
                  {formatDisplayValue(account.totalValue)}
                </div>
                <Badge
                  variant="outline"
                  className={
                    isPositive
                      ? 'border-green-500/50 text-green-500'
                      : 'border-red-500/50 text-red-500'
                  }
                >
                  {isPositive ? '+' : ''}
                  {formatPercent(account.totalGainLossPercent)}
                </Badge>
              </div>
              <DeleteConfirmDialog
                title={`Delete ${account.name}?`}
                description={`This will permanently delete the account "${account.name}" and all its holdings. This action cannot be undone.`}
                onConfirm={() => deleteAccount.mutateAsync(account.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {account.holdings.length} holding{account.holdings.length !== 1 ? 's' : ''}
              </div>
              <AddHoldingDialog
                accountId={account.id}
                accountName={account.name}
                accountCurrency={nativeCurrency}
                displayCurrency={displayCurrency}
              />
            </div>
            <HoldingsTable
              holdings={account.holdings}
              baseCurrency={nativeCurrency}
              displayCurrency={displayCurrency}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
