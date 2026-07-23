'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useCategorizationLogs, type CategorizationLog } from '@/lib/hooks/use-budget';

const STATUS_LABEL: Record<CategorizationLog['status'], { text: string; className: string }> = {
  suggested: { text: 'Suggested', className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  low_confidence: {
    text: 'Low confidence',
    className: 'bg-yellow-400/15 text-yellow-700 dark:text-yellow-300',
  },
  no_match: { text: 'No match', className: 'bg-muted text-muted-foreground' },
  error: { text: 'Error', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LogCard({ log }: { log: CategorizationLog }) {
  const s = STATUS_LABEL[log.status];
  return (
    <div className="bg-card border-border rounded-lg border px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{log.transactionName}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.className}`}
        >
          {s.text}
        </span>
        {log.confidence != null && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {Math.round(log.confidence * 100)}%
          </span>
        )}
      </div>
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {log.resultCategoryName && <span>→ {log.resultCategoryName}</span>}
        <span>{formatTime(log.createdAt)}</span>
      </div>
      {log.reasoning && (
        <div className="text-muted-foreground mt-1 text-xs italic">{log.reasoning}</div>
      )}
    </div>
  );
}

export default function CategorizationLogPage() {
  const { data, isLoading, error } = useCategorizationLogs();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="page-title text-4xl font-bold tracking-tight">AI Categorization Log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every AI categorization query for this household — the transaction, the category the model
          chose (if any), and how confident it was. Low-confidence and no-match results are recorded
          here but never applied.
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
          No queries yet. Run “Suggest categories” from the Transactions page.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((log) => (
            <LogCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
