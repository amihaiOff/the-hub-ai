'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { WikiMarkdown } from '@/components/wiki/wiki-markdown';

/**
 * Dashboard scratchpad — a household-shared markdown block for one-off
 * notes. Two modes:
 *   - view: renders `body` as markdown. Click to edit.
 *   - edit: raw textarea, autosaves debounced. Blur to return to view.
 * Empty state (no notes yet) opens directly into edit mode with a
 * placeholder so the box is discoverable.
 */

const AUTOSAVE_MS = 800;

interface NotesResponse {
  notes: string;
}

export function DashboardNotesCard() {
  const qc = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);
  const query = useQuery({
    queryKey: ['dashboard', 'notes'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/notes');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as NotesResponse;
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dashboard/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as NotesResponse;
    },
    onSuccess: (data) => {
      // setQueryData bumps dataUpdatedAt → Editor is re-keyed and remounts
      // with the fresh empty value, dropping any in-progress unsaved edits.
      qc.setQueryData(['dashboard', 'notes'], data);
      setConfirmClear(false);
    },
  });

  const hasNotes = (query.data?.notes ?? '').trim().length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="text-muted-foreground h-4 w-4" />
          Notes
        </CardTitle>
        {hasNotes && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            aria-label="Clear all notes"
            title="Clear all notes"
            className="text-muted-foreground hover:text-destructive h-7 gap-1.5 px-2 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : query.error ? (
          <div className="text-destructive text-xs">{(query.error as Error).message}</div>
        ) : (
          <Editor key={query.dataUpdatedAt} initial={query.data?.notes ?? ''} />
        )}
      </CardContent>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all notes?</DialogTitle>
            <DialogDescription>
              This wipes the scratchpad for everyone in the household. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => clearAll.mutate()}
              disabled={clearAll.isPending}
            >
              {clearAll.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Editor({ initial }: { initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(initial.trim().length === 0);
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
    timerRef.current = setTimeout(() => save.mutate(value), AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // save.mutate is stable across renders — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Flush any pending debounced write when leaving edit mode. Otherwise
  // clicking out too fast could re-render the view with the last-saved
  // (stale) markdown and the newest keystrokes would only land ~800ms later.
  const flushAndClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value !== savedRef.current) save.mutate(value);
    setEditing(false);
  };

  const openEdit = () => setEditing(true);

  if (editing) {
    return (
      <Textarea
        autoFocus
        dir="auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={flushAndClose}
        placeholder="Jot down anything for later — thoughts, tasks, links to convert into wiki sources…"
        className="min-h-[100px] resize-y font-mono text-xs"
      />
    );
  }

  // View mode.
  if (!value.trim()) {
    // Shouldn't normally happen (empty note opens directly into edit mode),
    // but if the user cleared everything and blurred, offer a re-entry.
    return (
      <button
        type="button"
        onClick={openEdit}
        className="text-muted-foreground hover:text-foreground w-full py-4 text-left text-xs"
      >
        Jot down anything for later — click to start.
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openEdit}
      aria-label="Edit notes"
      title="Click to edit"
      className="hover:bg-muted/30 -mx-2 w-full cursor-text rounded px-2 py-1 text-left transition-colors"
    >
      <WikiMarkdown source={value} />
    </button>
  );
}
