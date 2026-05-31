'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatCurrencyILS } from '@/lib/utils/budget';
import type { MoneytorStockAccount } from '@/lib/hooks/use-moneytor';

interface MoneytorStocksSectionProps {
  accounts: MoneytorStockAccount[];
  isLoading: boolean;
}

function formatMoney(value: number, currency: string): string {
  if (currency === 'ILS') return formatCurrencyILS(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function pnlClass(price: number, purchasePrice: number | null) {
  if (purchasePrice == null) return '';
  if (price > purchasePrice) return 'text-green-600 dark:text-green-400';
  if (price < purchasePrice) return 'text-red-600 dark:text-red-400';
  return '';
}

export function MoneytorStocksSection({ accounts, isLoading }: MoneytorStocksSectionProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-center text-sm">
          Loading stock holdings...
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return null; // No stocks synced yet — keep the page tidy
  }

  return (
    <div className="space-y-4">
      {accounts.map((acct) => {
        const totalCount = acct.holdings.length;
        return (
          <Card key={acct.productId}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">{acct.accountName}</CardTitle>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {[acct.broker, `${totalCount} ${totalCount === 1 ? 'holding' : 'holdings'}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">
                  {formatCurrencyILS(acct.totalValue)}
                </div>
                {acct.cash != null && acct.cash > 0 && (
                  <div className="text-muted-foreground text-xs">
                    cash: {formatCurrencyILS(acct.cash)}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile: cards */}
              <div className="space-y-2 px-4 pb-4 md:hidden">
                {acct.holdings.map((h) => (
                  <div key={h.id} className="bg-muted/30 rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{h.stockName}</div>
                        <div className="text-muted-foreground text-xs">
                          {formatQuantity(h.amount)} × {formatMoney(h.stockPrice, h.currency)}
                          {h.purchasePrice != null && (
                            <>
                              {' · buy '}
                              <span className={pnlClass(h.stockPrice, h.purchasePrice)}>
                                {formatMoney(h.purchasePrice, h.currency)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatCurrencyILS(h.totalWorthInBase)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Buy price</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-28">Bought</TableHead>
                      <TableHead className="text-right">Value (ILS)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acct.holdings.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{h.stockName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(h.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                          {h.purchasePrice != null ? formatMoney(h.purchasePrice, h.currency) : '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            pnlClass(h.stockPrice, h.purchasePrice)
                          )}
                        >
                          {formatMoney(h.stockPrice, h.currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {h.purchaseDate ? formatDate(h.purchaseDate) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrencyILS(h.totalWorthInBase)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
