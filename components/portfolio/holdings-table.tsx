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
  onDelete: () => Promise<void>;
}

function HoldingRow({ holding, formatDisplayValue, onDelete }: HoldingRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isPositive = holding.gainLoss >= 0;

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
        {formatDisplayValue(holding.currentPrice)}
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
              onDelete={() => deleteHolding.mutateAsync(holding.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
