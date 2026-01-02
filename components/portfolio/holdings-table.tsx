'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EditHoldingDialog } from './edit-holding-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useDeleteHolding } from '@/lib/hooks/use-portfolio';
import { formatPercent, formatQuantity } from '@/lib/utils/portfolio';
import { useCurrency } from '@/lib/contexts/currency-context';
import type { HoldingValue } from '@/lib/utils/portfolio';

interface HoldingsTableProps {
  holdings: HoldingValue[];
  baseCurrency?: string;
}

export function HoldingsTable({ holdings, baseCurrency = 'USD' }: HoldingsTableProps) {
  const deleteHolding = useDeleteHolding();
  const { formatValue } = useCurrency();

  if (holdings.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        No holdings yet. Add your first stock to get started.
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
          {holdings.map((holding) => {
            const isPositive = holding.gainLoss >= 0;

            return (
              <TableRow key={holding.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holding.symbol}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(holding.quantity)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatValue(holding.avgCostBasis, baseCurrency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatValue(holding.currentPrice, baseCurrency)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatValue(holding.currentValue, baseCurrency)}
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <div className="flex flex-col items-end">
                    <Badge
                      variant="outline"
                      className={
                        isPositive
                          ? 'border-green-500/50 text-green-500'
                          : 'border-red-500/50 text-red-500'
                      }
                    >
                      {isPositive ? '+' : ''}
                      {formatValue(holding.gainLoss, baseCurrency)}
                    </Badge>
                    <span
                      className={`text-xs ${
                        isPositive ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {formatPercent(holding.gainLossPercent)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <EditHoldingDialog holdingId={holding.id} holding={holding} />
                    <DeleteConfirmDialog
                      title={`Delete ${holding.symbol}?`}
                      description={`This will remove ${holding.symbol} from your account. This action cannot be undone.`}
                      onConfirm={() => deleteHolding.mutateAsync(holding.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
