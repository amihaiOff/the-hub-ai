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

// 1–28 keeps every month covered without month-length edge cases.
const DAY_CHOICES = Array.from({ length: 28 }, (_, i) => i + 1);

export function SnapshotDaySettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'snapshot-day'],
    queryFn: async () => {
      const res = await fetch('/api/settings/snapshot-day');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { dayOfMonth: number };
    },
  });

  const save = useMutation({
    mutationFn: async (dayOfMonth: number) => {
      const res = await fetch('/api/settings/snapshot-day', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayOfMonth }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'snapshot-day'] });
    },
  });

  const value = String(query.data?.dayOfMonth ?? 26);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Net worth snapshot day</p>
      <p className="text-muted-foreground text-xs">
        Day of the month the automatic net-worth snapshot is taken. Later in the month gives figures
        time to settle (bank sync, pension deposits, month-end statements). Applies to the chart on
        the dashboard.
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
            {DAY_CHOICES.map((d) => (
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
