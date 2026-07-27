'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

/**
 * Dashboard scratchpad — a household-shared textarea for one-off notes the
 * user wants to sweep into real tasks or notes later. Autosaves debounced
 * with no visible status: the box just always saves. A save failure is
 * silently retried on the next keystroke via the same debounce path.
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
      qc.setQueryData(['dashboard', 'notes'], data);
    },
  });

  // Debounced autosave. Cleared on unmount so a rapid page-nav doesn't fire.
  useEffect(() => {
    if (value === savedRef.current) return;
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
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Jot down anything for later — thoughts, tasks, links to convert into wiki sources…"
      className="min-h-[100px] resize-y text-sm"
    />
  );
}
