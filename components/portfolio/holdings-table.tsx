'use client';

import { useCallback, useState } from 'react';
import { MoreVertical, Pencil, Trash2, TrendingUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditHoldingDialog } from './edit-holding-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useDeleteHolding } from '@/lib/hooks/use-portfolio';
import { formatPercent, formatQuantity } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import type { HoldingValue } from '@/lib/utils/portfolio';

interface HoldingsTableProps {
  holdings: HoldingValue[];
  baseCurrency?: string;
  displayCurrency?: string;
}

interface HoldingRowProps {
  holding: HoldingValue;
  formatDisplayValue: (value: number) => string;
  formatOriginalCurrency: (value: number, currency: string) => string;
  convertToILS: (value: number, currency: string) => number;
  showDualCurrency: boolean;
  onDelete: () => Promise<void>;
}

function HoldingRow({
  holding,
  formatDisplayValue,
  formatOriginalCurrency,
  convertToILS,
  showDualCurrency,
  onDelete,
}: HoldingRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isPositive = holding.gainLoss >= 0;

  // Check if this holding has a foreign price currency (e.g., GBP for EIMI.L)
  const priceCurrency = holding.priceCurrency || 'USD';
  const hasForeignPrice = priceCurrency !== 'ILS' && showDualCurrency;

  // Calculate ILS values for foreign-priced holdings
  const priceInILS = hasForeignPrice
    ? convertToILS(holding.currentPrice, priceCurrency)
    : holding.currentPrice;
  const valueInILS = hasForeignPrice
    ? convertToILS(holding.currentValue, priceCurrency)
    : holding.currentValue;
  // Gain/loss is already in ILS since avgCostBasis is in ILS
  // Recalculate: gainLoss = valueInILS - costBasis (costBasis is quantity * avgCostBasis in ILS)
  const gainLossInILS = hasForeignPrice ? valueInILS - holding.costBasis : holding.gainLoss;
  const gainLossPercentInILS = hasForeignPrice
    ? holding.costBasis > 0
      ? ((valueInILS - holding.costBasis) / holding.costBasis) * 100
      : 0
    : holding.gainLossPercent;
  const isPositiveILS = hasForeignPrice ? gainLossInILS >= 0 : isPositive;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{holding.symbol}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatQuantity(holding.quantity)}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">
        {formatDisplayValue(holding.avgCostBasis)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {hasForeignPrice ? (
          <span>
            {formatDisplayValue(priceInILS)}
            <span className="text-muted-foreground/60 ml-1 text-xs">
              ({formatOriginalCurrency(holding.currentPrice, priceCurrency)})
            </span>
          </span>
        ) : (
          formatDisplayValue(holding.currentPrice)
        )}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {hasForeignPrice ? (
          <span>
            {formatDisplayValue(valueInILS)}
            <span className="text-muted-foreground/60 ml-1 text-xs">
              ({formatOriginalCurrency(holding.currentValue, priceCurrency)})
            </span>
          </span>
        ) : (
          formatDisplayValue(holding.currentValue)
        )}
      </TableCell>
      <TableCell className="hidden text-right md:table-cell">
        <div className="flex flex-col items-end">
          <Badge
            variant="outline"
            className={
              isPositiveILS
                ? 'border-green-500/50 text-green-500'
                : 'border-red-500/50 text-red-500'
            }
          >
            {isPositiveILS ? '+' : ''}
            {formatDisplayValue(hasForeignPrice ? gainLossInILS : holding.gainLoss)}
          </Badge>
          <span className={`text-xs ${isPositiveILS ? 'text-green-500' : 'text-red-500'}`}>
            {formatPercent(hasForeignPrice ? gainLossPercentInILS : holding.gainLossPercent)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Holding options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit holding
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete holding
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <EditHoldingDialog
            holdingId={holding.id}
            holding={holding}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          />
          <DeleteConfirmDialog
            title={`Delete ${holding.symbol}?`}
            description={`This will remove ${holding.symbol} from your account. This action cannot be undone.`}
            onConfirm={onDelete}
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function HoldingsTable({
  holdings,
  baseCurrency = 'USD',
  displayCurrency,
}: HoldingsTableProps) {
  const deleteHolding = useDeleteHolding();
  const { formatValue, rates } = useCurrency();

  // Use displayCurrency if provided, otherwise use baseCurrency
  const effectiveDisplayCurrency = displayCurrency || baseCurrency;

  // Check if we should show dual currency (when account is ILS-based for dual-listed stocks)
  const showDualCurrency = baseCurrency === 'ILS' && !!rates;

  // Convert a value from a given currency to ILS
  const convertToILS = useCallback(
    (value: number, currency: string): number => {
      if (!rates || currency === 'ILS') return value;
      const upperCurrency = currency.toUpperCase();
      // rates are TO ILS (e.g., rates.USD = 3.18 means 1 USD = 3.18 ILS)
      const rate = rates[upperCurrency as keyof typeof rates] || rates.USD || 1;
      return value * rate;
    },
    [rates]
  );

  // Format a value in its original currency (for the parenthetical display)
  const formatOriginalCurrency = useCallback((value: number, currency: string): string => {
    const locale = currency === 'ILS' ? 'he-IL' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }, []);

  // Convert and format a value from baseCurrency to displayCurrency
  // Note: rates are TO ILS (e.g., rates.USD = 3.18 means 1 USD = 3.18 ILS)
  // Memoized to prevent unnecessary recalculations on re-renders
  const formatDisplayValue = useCallback(
    (value: number): string => {
      if (effectiveDisplayCurrency !== baseCurrency && rates) {
        let convertedValue: number;
        if (baseCurrency === 'ILS' && effectiveDisplayCurrency === 'USD') {
          // Convert ILS to USD: divide by USD-to-ILS rate
          convertedValue = value / (rates.USD || 1);
        } else if (baseCurrency === 'USD' && effectiveDisplayCurrency === 'ILS') {
          // Convert USD to ILS: multiply by USD-to-ILS rate
          convertedValue = value * (rates.USD || 1);
        } else {
          // Default: no conversion
          convertedValue = value;
        }
        return new Intl.NumberFormat(effectiveDisplayCurrency === 'ILS' ? 'he-IL' : 'en-US', {
          style: 'currency',
          currency: effectiveDisplayCurrency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(convertedValue);
      }

      return formatValue(value, baseCurrency);
    },
    [effectiveDisplayCurrency, baseCurrency, rates, formatValue]
  );

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="bg-muted mb-3 rounded-full p-3">
          <TrendingUp className="text-muted-foreground h-6 w-6" />
        </div>
        <p className="text-foreground mb-1 text-sm font-medium">No holdings yet</p>
        <p className="text-muted-foreground mb-4 text-sm">
          Add your first stock using the button above to start tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Avg Cost</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="hidden text-right md:table-cell">Gain/Loss</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => (
            <HoldingRow
              key={holding.id}
              holding={holding}
              formatDisplayValue={formatDisplayValue}
              formatOriginalCurrency={formatOriginalCurrency}
              convertToILS={convertToILS}
              showDualCurrency={showDualCurrency}
              onDelete={() => deleteHolding.mutateAsync(holding.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
