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
import { NotesEditor } from '@/components/tasks/notes-editor';

/**
 * Dashboard scratchpad — a household-shared block of notes. A lightweight
 * WYSIWYG (markdown-backed) editor supporting headings and lists, so it reads
 * and edits like the Areas pages without the full block machinery. Autosaves
 * on a debounce; the value is stored as markdown so older plain-text notes
 * load unchanged.
 */

const AUTOSAVE_MS = 800;

interface NotesResponse {
  notes: string;
}

async function putNotes(notes: string): Promise<NotesResponse> {
  const res = await fetch('/api/dashboard/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data as NotesResponse;
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
      {query.isLoading ? (
        <>
          <NotesCardHeader hasNotes={false} onClear={() => {}} />
          <CardContent className="pt-0">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          </CardContent>
        </>
      ) : query.error ? (
        <>
          <NotesCardHeader hasNotes={false} onClear={() => {}} />
          <CardContent className="pt-0">
            <div className="text-destructive text-xs">{(query.error as Error).message}</div>
          </CardContent>
        </>
      ) : (
        <NotesCardBody initial={query.data?.notes ?? ''} />
      )}
    </Card>
  );
}

function NotesCardHeader({ hasNotes, onClear }: { hasNotes: boolean; onClear: () => void }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <StickyNote className="text-muted-foreground h-4 w-4" />
        Notes
      </CardTitle>
      {hasNotes && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Clear all notes"
          title="Clear all notes"
          className="text-muted-foreground hover:text-destructive h-7 px-2"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </CardHeader>
  );
}

/**
 * The loaded card — owns the editor's draft (markdown) plus debounced
 * autosave. Mounted once the notes have loaded, so it never remounts on our
 * own saves (which is what used to yank focus mid-typing).
 */
function NotesCardBody({ initial }: { initial: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);
  // Last value the server has; a debounced save only fires when the draft
  // actually diverges from it.
  const savedRef = useRef(initial);
  // Mirror of `draft` for closures that outlive a render — namely the
  // unmount cleanup, which must flush the *latest* text.
  const draftRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: putNotes,
    onSuccess: (data) => {
      savedRef.current = data.notes;
      qc.setQueryData(['dashboard', 'notes'], data);
    },
  });

  const scheduleSave = (md: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (md !== savedRef.current) save.mutate(md);
    }, AUTOSAVE_MS);
  };

  const handleChange = (md: string) => {
    setDraft(md);
    draftRef.current = md;
    scheduleSave(md);
  };

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (draftRef.current !== savedRef.current) save.mutate(draftRef.current);
  };

  const clearAll = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDraft('');
    draftRef.current = '';
    save.mutate('');
    setConfirmClear(false);
  };

  // On unmount (navigating away), cancel the pending debounce and flush the
  // latest edit so a change made within the autosave window isn't lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (draftRef.current !== savedRef.current) save.mutate(draftRef.current);
    };
    // Fire exactly once, on unmount. save.mutate is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasNotes = draft.trim().length > 0;

  return (
    <>
      <NotesCardHeader hasNotes={hasNotes} onClear={() => setConfirmClear(true)} />
      <CardContent className="pt-0">
        <NotesEditor
          value={draft}
          onChange={handleChange}
          onBlur={flush}
          showHeadings
          placeholder="Jot down anything for later — thoughts, tasks, links to convert into wiki sources…"
        />
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
            <Button variant="destructive" onClick={clearAll} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
