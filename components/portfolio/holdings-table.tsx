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
  onDelete: () => Promise<void>;
}

function HoldingRow({
  holding,
  formatDisplayValue,
  formatOriginalCurrency,
  onDelete,
}: HoldingRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isPositive = holding.gainLoss >= 0;

  // Check if this holding has an original price in a different currency (for display purposes)
  const hasOriginalPrice = holding.originalPrice !== undefined && holding.originalPriceCurrency;

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
        {hasOriginalPrice ? (
          <span>
            {formatDisplayValue(holding.currentPrice)}
            <span className="text-muted-foreground/60 ml-1 text-xs">
              (
              {formatOriginalCurrency(
                holding.originalPrice ?? 0,
                holding.originalPriceCurrency ?? 'USD'
              )}
              )
            </span>
          </span>
        ) : (
          formatDisplayValue(holding.currentPrice)
        )}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatDisplayValue(holding.currentValue)}
      </TableCell>
      <TableCell className="hidden text-right md:table-cell">
        <div className="flex flex-col items-end">
          <Badge
            variant="outline"
            className={
              isPositive ? 'border-green-500/50 text-green-500' : 'border-red-500/50 text-red-500'
            }
          >
            {isPositive ? '+' : ''}
            {formatDisplayValue(holding.gainLoss)}
          </Badge>
          <span className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {formatPercent(holding.gainLossPercent)}
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

  // Format a value in its original currency (for the parenthetical display of foreign prices)
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
        const upperBaseCurrency = baseCurrency.toUpperCase() as keyof typeof rates;
        const upperDisplayCurrency = effectiveDisplayCurrency.toUpperCase();

        if (upperDisplayCurrency === 'ILS' && upperBaseCurrency !== 'ILS') {
          // Convert any currency to ILS: multiply by that currency's rate to ILS
          const rate = rates[upperBaseCurrency] || rates.USD || 1;
          convertedValue = value * rate;
        } else if (upperDisplayCurrency !== 'ILS' && upperBaseCurrency === 'ILS') {
          // Convert ILS to any currency: divide by that currency's rate to ILS
          const rate = rates[upperDisplayCurrency as keyof typeof rates] || rates.USD || 1;
          convertedValue = rate > 0 ? value / rate : value;
        } else {
          // Cross-currency conversion (e.g., EUR to USD): go through ILS
          const baseRate = rates[upperBaseCurrency] || rates.USD || 1;
          const displayRate = rates[upperDisplayCurrency as keyof typeof rates] || rates.USD || 1;
          convertedValue = displayRate > 0 ? (value * baseRate) / displayRate : value;
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
              onDelete={() => deleteHolding.mutateAsync(holding.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
