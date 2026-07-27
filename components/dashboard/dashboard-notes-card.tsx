'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Dashboard scratchpad — a household-shared textarea for one-off notes the
 * user wants to sweep into real tasks or notes later. Autosaves debounced
 * so the user never has to click Save; a tiny status pill next to the
 * title conveys saved/saving/error state.
 */

const AUTOSAVE_MS = 800;

interface NotesResponse {
  notes: string;
}

export function DashboardNotesCard() {
  const query = useQuery({
    queryKey: ['dashboard', 'notes'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/notes');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as NotesResponse;
    },
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="text-muted-foreground h-4 w-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : query.error ? (
          <div className="text-destructive text-xs">{(query.error as Error).message}</div>
        ) : (
          <Editor initial={query.data?.notes ?? ''} />
        )}
      </CardContent>
    </Card>
  );
}

function Editor({ initial }: { initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const savedRef = useRef(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: async (notes: string) => {
      const res = await fetch('/api/dashboard/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as NotesResponse;
    },
    onSuccess: (data) => {
      savedRef.current = data.notes;
      setStatus('saved');
      qc.setQueryData(['dashboard', 'notes'], data);
    },
    onError: () => setStatus('error'),
  });

  // Debounced autosave. Cleared on unmount so a rapid page-nav doesn't fire.
  useEffect(() => {
    if (value === savedRef.current) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save.mutate(value);
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // save.mutate is stable across renders — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Jot down anything for later — thoughts, tasks, links to convert into wiki sources…"
        className="min-h-[100px] resize-y text-sm"
      />
      <div className="flex justify-end">
        <StatusPill status={status} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px]',
        status === 'error' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {status === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      ) : status === 'saved' ? (
        <>
          <Check className="h-3 w-3" />
          Saved
        </>
      ) : (
        'Save failed'
      )}
    </span>
  );
}
