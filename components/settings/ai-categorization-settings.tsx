'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCategorizationLogs, type CategorizationLog } from '@/lib/hooks/use-budget';

interface KeyState {
  hasKey: boolean;
  maskedKey: string | null;
}

const STATUS_LABEL: Record<CategorizationLog['status'], { text: string; className: string }> = {
  suggested: { text: 'Suggested', className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  low_confidence: {
    text: 'Low confidence',
    className: 'bg-yellow-400/15 text-yellow-700 dark:text-yellow-300',
  },
  no_match: { text: 'No match', className: 'bg-muted text-muted-foreground' },
  error: { text: 'Error', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

export function AiCategorizationSettings() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const key = useQuery({
    queryKey: ['settings', 'anthropic-key'],
    queryFn: async () => {
      const res = await fetch('/api/settings/anthropic-key');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as KeyState;
    },
  });

  const save = useMutation({
    mutationFn: async (apiKey: string | null) => {
      const res = await fetch('/api/settings/anthropic-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['settings', 'anthropic-key'] });
    },
  });

  const logs = useCategorizationLogs();
  const hasKey = key.data?.hasKey;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">AI auto-categorization</p>
        <p className="text-muted-foreground text-xs">
          Anthropic API key used to suggest categories for uncategorized transactions. The key is
          stored for your household and never shown again after saving.
        </p>
      </div>

      {hasKey && !save.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Check className="h-3.5 w-3.5 text-green-500" />
          <span>Key set ({key.data?.maskedKey})</span>
          <button
            type="button"
            onClick={() => save.mutate(null)}
            className="text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={hasKey ? 'Replace key…' : 'sk-ant-…'}
          className="max-w-xs text-sm"
          autoComplete="off"
        />
        <Button
          size="sm"
          onClick={() => save.mutate(draft.trim())}
          disabled={!draft.trim() || save.isPending}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {save.isError && <p className="text-xs text-red-500">{(save.error as Error).message}</p>}

      {/* Query log */}
      <details className="border-border/60 rounded-lg border">
        <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-sm font-medium select-none">
          Categorization log{logs.data?.length ? ` (${logs.data.length})` : ''}
        </summary>
        <div className="border-border/60 max-h-72 space-y-1 overflow-y-auto border-t p-2">
          {logs.isLoading && <p className="text-muted-foreground px-1 py-2 text-xs">Loading…</p>}
          {!logs.isLoading && (logs.data?.length ?? 0) === 0 && (
            <p className="text-muted-foreground px-1 py-2 text-xs">
              No queries yet. Run “Suggest categories” from the Transactions page.
            </p>
          )}
          {logs.data?.map((log) => {
            const s = STATUS_LABEL[log.status];
            return (
              <div key={log.id} className="rounded-md px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{log.transactionName}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${s.className}`}>
                    {s.text}
                  </span>
                  {log.confidence != null && (
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {Math.round(log.confidence * 100)}%
                    </span>
                  )}
                </div>
                {(log.resultCategoryName || log.reasoning) && (
                  <div className="text-muted-foreground mt-0.5 truncate">
                    {log.resultCategoryName ? `→ ${log.resultCategoryName}` : ''}
                    {log.resultCategoryName && log.reasoning ? ' · ' : ''}
                    {log.reasoning ?? ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
