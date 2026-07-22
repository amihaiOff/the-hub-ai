'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { formatCurrencyILS } from '@/lib/utils/budget';

interface DropLogEntry {
  id: string;
  transactionDate: string;
  amountIls: number;
  payeeName: string | null;
  description: string | null;
  reason: string;
  droppedAt: string;
  originalMoneytorId: string | null;
}

function formatDroppedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DroppedTransactionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['labs', 'dropped-transactions'],
    queryFn: async () => {
      const res = await fetch('/api/labs/dropped-transactions');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load');
      return json.data as DropLogEntry[];
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="page-title text-4xl font-bold tracking-tight">
          Dropped Transactions
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Budget rows automatically removed because the corresponding Moneytor transaction
          disappeared on a re-sync. The daily sync re-aligns the trailing 14&nbsp;days with what
          Moneytor returns — anything that vanished from their feed is dropped locally and listed
          here for audit.
        </p>
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {error && (
        <div className="border-destructive text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4" />
          {(error as Error).message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="text-muted-foreground rounded-md border px-3 py-4 text-sm">
          No dropped transactions yet. They&apos;ll appear here the next time Moneytor stops
          returning a transaction that was previously in your budget.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr className="text-muted-foreground text-left text-xs font-medium tracking-wider uppercase">
                <th className="px-3 py-2">Dropped at</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((d) => (
                <tr key={d.id} className="hover:bg-muted/40">
                  <td className="text-muted-foreground px-3 py-2 text-xs whitespace-nowrap">
                    {formatDroppedAt(d.droppedAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.transactionDate}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Trash2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {d.payeeName ?? d.description ?? '(no payee)'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrencyILS(d.amountIls)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
