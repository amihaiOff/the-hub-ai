'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Loader2, Pencil, Trash2 } from 'lucide-react';

interface GeneralLogEntry {
  id: string;
  type: string;
  subjectType: string | null;
  subjectId: string | null;
  oldValue: string | null;
  newValue: string | null;
  description: string | null;
  readAt: string | null;
  createdAt: string;
}

interface GeneralLogPayload {
  unreadCount: number;
  entries: GeneralLogEntry[];
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function typeMeta(type: string): {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
} {
  switch (type) {
    case 'rename':
      return { icon: Pencil, label: 'Renamed' };
    case 'hard_delete':
      return { icon: Trash2, label: 'Removed' };
    default:
      return { icon: AlertCircle, label: type };
  }
}

export default function ActivityPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['labs', 'general-log'],
    queryFn: async () => {
      const res = await fetch('/api/labs/general-log');
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Failed to load');
      return json.data as GeneralLogPayload;
    },
  });

  // Mark everything read as soon as the page is viewed. Fire-and-forget: the
  // query will refetch on next mount and the badge will be clear.
  useEffect(() => {
    if (data && data.unreadCount > 0) {
      fetch('/api/labs/general-log/mark-read', { method: 'POST' })
        .then(() => queryClient.invalidateQueries({ queryKey: ['labs', 'general-log-unread'] }))
        .catch(() => {});
    }
  }, [data, queryClient]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Activity</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Notable events from syncs and other automated jobs — renames, removals, and other changes
          worth surfacing.
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

      {data && data.entries.length === 0 && (
        <div className="text-muted-foreground rounded-md border px-3 py-4 text-sm">
          No activity yet. Rename events and other notable sync outcomes will show up here.
        </div>
      )}

      {data && data.entries.length > 0 && (
        <div className="space-y-2">
          {data.entries.map((entry) => {
            const { icon: Icon, label } = typeMeta(entry.type);
            const isUnread = !entry.readAt;
            return (
              <div
                key={entry.id}
                className="bg-card border-border flex items-start gap-3 rounded-lg border px-4 py-3"
              >
                <div className="text-muted-foreground shrink-0 pt-0.5">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {entry.subjectType && (
                      <span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[10px] tracking-wider uppercase">
                        {entry.subjectType}
                      </span>
                    )}
                    {isUnread && (
                      <span className="bg-primary h-1.5 w-1.5 rounded-full" aria-label="Unread" />
                    )}
                  </div>
                  <div className="mt-1 text-sm">
                    {entry.type === 'rename' && entry.oldValue && entry.newValue ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="line-through opacity-60">{entry.oldValue}</span>
                        <ArrowRight className="text-muted-foreground h-3 w-3" />
                        <span>{entry.newValue}</span>
                      </span>
                    ) : (
                      <span>{entry.description ?? entry.newValue ?? entry.oldValue ?? '—'}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {formatTs(entry.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
