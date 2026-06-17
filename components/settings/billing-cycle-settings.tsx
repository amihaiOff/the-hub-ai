'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { VALID_BILLING_CYCLE_DAYS } from '@/lib/utils/billing-cycle';

export function BillingCycleSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'billing-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/settings/billing-cycle');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { startDay: number };
    },
  });

  const save = useMutation({
    mutationFn: async (startDay: number) => {
      const res = await fetch('/api/settings/billing-cycle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDay }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      // Any query that derives a date range from a month needs to refetch,
      // so blow the whole budget cache. Cheap and avoids stale spending totals.
      qc.invalidateQueries({ queryKey: ['settings', 'billing-cycle'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const value = String(query.data?.startDay ?? 1);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Billing cycle</p>
      <p className="text-muted-foreground text-xs">
        First day of every budget cycle. With day <code>10</code>, viewing &quot;June&quot; shows
        transactions from June 10 (inclusive) to July 10 (exclusive). All budget totals follow the
        same range.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={value}
          onValueChange={(v) => save.mutate(Number(v))}
          disabled={query.isLoading || save.isPending}
        >
          <SelectTrigger className="w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALID_BILLING_CYCLE_DAYS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Day {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {save.isPending && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
      </div>
      {save.isError && <p className="text-xs text-red-500">{(save.error as Error).message}</p>}
    </div>
  );
}
