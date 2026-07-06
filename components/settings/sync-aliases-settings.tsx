'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AliasKind = 'account' | 'pension' | 'realEstate';

interface AliasRow {
  kind: AliasKind;
  id: string;
  productId: string;
  name: string;
  form?: string;
  subtitle: string | null;
  stableKey: string | null;
  userCanonicalId: string | null;
}

interface AliasPayload {
  accounts: AliasRow[];
  pensions: AliasRow[];
  realEstate: AliasRow[];
}

function useAliases() {
  return useQuery({
    queryKey: ['settings', 'sync-aliases'],
    queryFn: async (): Promise<AliasPayload> => {
      const res = await fetch('/api/settings/sync-aliases');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load');
      return json.data as AliasPayload;
    },
  });
}

function AliasEditor({ row }: { row: AliasRow }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(row.userCanonicalId ?? '');

  const mutation = useMutation({
    mutationFn: async (next: string | null) => {
      const res = await fetch(`/api/settings/sync-aliases/${row.kind}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCanonicalId: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed');
      return json.data as { userCanonicalId: string | null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'sync-aliases'] }),
  });

  const trimmed = value.trim();
  const dirty = trimmed !== (row.userCanonicalId ?? '');

  return (
    <div className="border-border/60 flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.name}</div>
        <div className="text-muted-foreground truncate text-xs">
          {row.subtitle ? row.subtitle : `#${row.productId}`}
          {row.stableKey && (
            <>
              {' · '}
              <span className="font-mono">{row.stableKey.slice(0, 24)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Custom alias (optional)"
          className="w-56 text-sm"
        />
        <Button
          size="sm"
          onClick={() => mutation.mutate(trimmed.length ? trimmed : null)}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: AliasRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <AliasEditor key={`${row.kind}:${row.id}`} row={row} />
        ))}
      </div>
    </div>
  );
}

export function SyncAliasesSettings() {
  const { data, isLoading, error } = useAliases();

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Sync aliases</p>
        <p className="text-muted-foreground text-xs">
          Pin a stable alias for each synced entity. If Moneytor re-links a bank or the
          provider-issued ID changes, the alias keeps history attached to the same row instead of
          creating a duplicate.
        </p>
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      )}
      {error && <p className="text-xs text-red-500">{(error as Error).message}</p>}

      {data && (
        <div className="space-y-4">
          <Section title="Bank + debt accounts" rows={data.accounts} />
          <Section title="Pension funds" rows={data.pensions} />
          <Section title="Real estate" rows={data.realEstate} />
        </div>
      )}
    </div>
  );
}
