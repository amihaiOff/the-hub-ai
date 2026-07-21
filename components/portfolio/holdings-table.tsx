'use client';

import { useCallback, useState, useMemo, useRef } from 'react';
import { Pencil, Trash2, TrendingUp, ChevronDown, MoreVertical } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { cn } from '@/lib/utils';
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

/** Symbol avatar — consistent across mobile and desktop */
function SymbolAvatar({ symbol }: { symbol: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700/80 ring-1 ring-slate-600/50"
      aria-hidden="true"
    >
      <span className="text-sm font-bold text-[#a8caff]">{symbol.charAt(0)}</span>
    </div>
  );
}

// Mobile expandable card view
function MobileHoldingCard({
  holding,
  formatDisplayValue,
  formatOriginalCurrency,
  onDelete,
}: HoldingRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isPositive = holding.gainLoss >= 0;
  const hasOriginalPrice = holding.originalPrice !== undefined && holding.originalPriceCurrency;

  return (
    <div className="border-border border-b last:border-b-0 sm:hidden">
      {/* Collapsed view - tappable */}
      <div
        className="active:bg-muted/40 flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
        aria-label={`${holding.symbol}${holding.name ? `, ${holding.name}` : ''}, value ${formatDisplayValue(holding.currentValue)}, ${isPositive ? 'gain' : 'loss'} ${formatPercent(holding.gainLossPercent)}. Tap to ${isExpanded ? 'collapse' : 'expand'} details.`}
      >
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
          aria-hidden="true"
        />
        <SymbolAvatar symbol={holding.symbol} />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          {/* Left: Symbol + name */}
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">{holding.symbol}</span>
            {holding.name && (
              <span
                className="text-muted-foreground/70 truncate text-xs"
                style={{ maxWidth: '90px' }}
              >
                {holding.name}
              </span>
            )}
          </div>
          {/* Right: Value + gain/loss (stacked) */}
          <div className="flex shrink-0 flex-col items-end" dir="ltr">
            <span className="font-semibold tabular-nums">
              {formatDisplayValue(holding.currentValue)}
            </span>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'text-xs font-medium tabular-nums',
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {formatPercent(holding.gainLossPercent)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-muted/20 border-border/50 border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs tracking-wide uppercase">Qty</span>
              <p className="mt-0.5 font-medium tabular-nums">{formatQuantity(holding.quantity)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                Avg Cost
              </span>
              <p className="mt-0.5 font-medium tabular-nums">
                {formatDisplayValue(holding.avgCostBasis)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                Current Price
              </span>
              <p className="mt-0.5 font-medium tabular-nums">
                {formatDisplayValue(holding.currentPrice)}
                {hasOriginalPrice && (
                  <span className="text-muted-foreground/60 ml-1 text-xs">
                    (
                    {formatOriginalCurrency(
                      holding.originalPrice ?? 0,
                      holding.originalPriceCurrency ?? 'USD'
                    )}
                    )
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                Total Cost
              </span>
              <p className="mt-0.5 font-medium tabular-nums">
                {formatDisplayValue(holding.quantity * holding.avgCostBasis)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                Gain/Loss
              </span>
              <p
                className={cn(
                  'mt-0.5 font-semibold tabular-nums',
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                )}
                dir="ltr"
              >
                {isPositive ? '+' : ''}
                {formatDisplayValue(holding.gainLoss)}
              </p>
            </div>
          </div>
          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[40px] flex-1"
              onClick={(e) => {
                e.stopPropagation();
                setShowEditDialog(true);
              }}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive min-h-[40px] flex-1"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      )}

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
  );
}

// Desktop table row view — with actions dropdown
function DesktopHoldingRow({
  holding,
  formatDisplayValue,
  formatOriginalCurrency,
  onDelete,
}: HoldingRowProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isPositive = holding.gainLoss >= 0;
  const hasOriginalPrice = holding.originalPrice !== undefined && holding.originalPriceCurrency;
  const hasTooltipContent = Boolean(holding.taseSymbol);

  const symbolCellContent = (
    <div className="flex cursor-default items-center gap-3">
      <SymbolAvatar symbol={holding.symbol} />
      <div className="flex flex-col">
        <span className="text-base font-bold">{holding.symbol}</span>
        {holding.name && (
          <span className="text-muted-foreground/70 max-w-[140px] truncate text-xs">
            {holding.name}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <TableRow className="border-border/50 group hidden border-b sm:table-row">
        <TableCell className="py-4">
          {hasTooltipContent ? (
            <Tooltip>
              <TooltipTrigger asChild>{symbolCellContent}</TooltipTrigger>
              <TooltipContent side="right" className="max-w-[250px]">
                <div className="flex flex-col gap-1">
                  {holding.name && <p className="text-sm font-medium">{holding.name}</p>}
                  {holding.taseSymbol && (
                    <p className="text-muted-foreground text-xs">{holding.taseSymbol}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            symbolCellContent
          )}
        </TableCell>
        <TableCell className="py-4 text-center font-mono tabular-nums">
          {formatQuantity(holding.quantity)}
        </TableCell>
        <TableCell className="py-4 text-right font-mono tabular-nums">
          {formatDisplayValue(holding.avgCostBasis)}
        </TableCell>
        <TableCell className="py-4 text-right font-mono tabular-nums">
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
        <TableCell className="py-4 text-right text-base font-bold tabular-nums" dir="ltr">
          {formatDisplayValue(holding.currentValue)}
        </TableCell>
        <TableCell className="hidden py-4 text-right md:table-cell">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              isPositive ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {formatPercent(holding.gainLossPercent)}
          </span>
        </TableCell>
        {/* Actions column */}
        <TableCell className="py-4 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Options for ${holding.symbol}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit holding
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete holding
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

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
    </>
  );
}

export function HoldingsTable({
  holdings,
  baseCurrency = 'USD',
  displayCurrency,
}: HoldingsTableProps) {
  const deleteHolding = useDeleteHolding();
  const { formatValue, rates } = useCurrency();

  const effectiveDisplayCurrency = displayCurrency || baseCurrency;

  const displayFormatter = useMemo(
    () =>
      new Intl.NumberFormat(effectiveDisplayCurrency === 'ILS' ? 'he-IL' : 'en-US', {
        style: 'currency',
        currency: effectiveDisplayCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [effectiveDisplayCurrency]
  );

  const currencyFormattersRef = useRef(new Map<string, Intl.NumberFormat>());

  const formatOriginalCurrency = useCallback((value: number, currency: string): string => {
    let formatter = currencyFormattersRef.current.get(currency);
    if (!formatter) {
      const locale = currency === 'ILS' ? 'he-IL' : 'en-US';
      formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      currencyFormattersRef.current.set(currency, formatter);
    }
    return formatter.format(value);
  }, []);

  const formatDisplayValue = useCallback(
    (value: number): string => {
      if (effectiveDisplayCurrency !== baseCurrency && rates) {
        let convertedValue: number;
        const upperBaseCurrency = baseCurrency.toUpperCase() as keyof typeof rates;
        const upperDisplayCurrency = effectiveDisplayCurrency.toUpperCase();

        if (upperDisplayCurrency === 'ILS' && upperBaseCurrency !== 'ILS') {
          const rate = rates[upperBaseCurrency] || rates.USD || 1;
          convertedValue = value * rate;
        } else if (upperDisplayCurrency !== 'ILS' && upperBaseCurrency === 'ILS') {
          const rate = rates[upperDisplayCurrency as keyof typeof rates] || rates.USD || 1;
          convertedValue = rate > 0 ? value / rate : value;
        } else {
          const baseRate = rates[upperBaseCurrency] || rates.USD || 1;
          const displayRate = rates[upperDisplayCurrency as keyof typeof rates] || rates.USD || 1;
          convertedValue = displayRate > 0 ? (value * baseRate) / displayRate : value;
        }

        return displayFormatter.format(convertedValue);
      }

      return formatValue(value, baseCurrency);
    },
    [effectiveDisplayCurrency, baseCurrency, rates, formatValue, displayFormatter]
  );

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="bg-muted mb-3 rounded-full p-3">
          <TrendingUp className="text-muted-foreground h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-foreground mb-1 text-sm font-medium">No holdings yet</p>
        <p className="text-muted-foreground mb-4 text-sm">
          Add your first stock using the button above to start tracking.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile view - expandable cards */}
      <div className="sm:hidden">
        {holdings.map((holding) => (
          <MobileHoldingCard
            key={holding.id}
            holding={holding}
            formatDisplayValue={formatDisplayValue}
            formatOriginalCurrency={formatOriginalCurrency}
            onDelete={() => deleteHolding.mutateAsync(holding.id)}
          />
        ))}
      </div>

      {/* Desktop view - table */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Symbol
              </TableHead>
              <TableHead className="text-muted-foreground text-center text-xs font-semibold tracking-widest uppercase">
                Qty
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-widest uppercase">
                Avg Cost
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-widest uppercase">
                Price
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs font-semibold tracking-widest uppercase">
                Value
              </TableHead>
              <TableHead className="text-muted-foreground hidden text-right text-xs font-semibold tracking-widest uppercase md:table-cell">
                Gain/Loss
              </TableHead>
              <TableHead className="w-10" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((holding) => (
              <DesktopHoldingRow
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
    </>
  );
}
