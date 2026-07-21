'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { usePage, useUpdatePage, useDeletePage } from '@/lib/hooks/use-pages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UpdatePageInput } from '@/lib/validations/pages';
import { EmojiPicker } from './emoji-picker';
import { PageBodyEditor } from './page-body-editor';

const SAVE_MS = 700;

export function PageEditor({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { data: page, isLoading, error } = usePage(pageId);
  const update = useUpdatePage();
  const del = useDeletePage();

  const [title, setTitle] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Seed the local title when the page loads / changes, tracked by id so
  // switching pages re-seeds without fighting the controlled input while
  // typing. This is React's "adjust state during render" pattern (state, not a
  // ref, so it's render-safe).
  const [seededId, setSeededId] = useState<string | null>(null);
  if (page && seededId !== page.id) {
    setSeededId(page.id);
    setTitle(page.title);
  }

  // Debounced autosave. A single pending patch (per page id) is merged and
  // flushed on a timer — or immediately when the page changes / unmounts, so a
  // fast navigation never drops the last edit. Refs are only touched in event
  // handlers / effects (never during render).
  const pending = useRef<{ id: string; patch: UpdatePageInput } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (p) update.mutate(p);
  }, [update]);

  const schedule = useCallback(
    (patch: UpdatePageInput) => {
      // If a different page has an unsaved edit, flush it before queuing this one.
      if (pending.current && pending.current.id !== pageId) flush();
      pending.current = { id: pageId, patch: { ...pending.current?.patch, ...patch } };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_MS);
    },
    [pageId, flush]
  );

  // Flush the outgoing page's pending edit when the id changes or on unmount.
  // A ref indirection keeps the effect from depending on `flush` (whose
  // identity changes each render) so it only fires on a real page switch.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => flushRef.current(), [pageId]);

  const saveTitle = useCallback(
    (next: string) => {
      setTitle(next);
      schedule({ title: next.trim() });
    },
    [schedule]
  );

  const saveContent = useCallback((doc: unknown) => schedule({ content: doc }), [schedule]);

  const handleDelete = () => {
    del.mutate(pageId, {
      onSuccess: () => {
        setConfirmOpen(false);
        // Land on the dashboard (the app home). Direct target — `/dashboard`
        // now just redirects to `/`.
        router.push('/');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading page…
      </div>
    );
  }
  if (error || !page) {
    return (
      <div className="border-destructive text-destructive rounded-2xl border px-4 py-3 text-sm">
        {error ? (error as Error).message : 'Page not found.'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      {/* Top bar: save status + overflow menu (delete). */}
      <div className="flex items-center justify-end gap-3">
        {update.isError ? (
          <span className="text-destructive text-xs">
            Couldn&apos;t save — check your connection
          </span>
        ) : update.isPending ? (
          <span className="text-muted-foreground text-xs">Saving…</span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Page options"
              className="hover:bg-muted/60 text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive rounded-lg text-sm"
              onSelect={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Emoji + title header. */}
      <div className="space-y-2">
        <EmojiPicker
          value={page.emoji}
          onSelect={(emoji) => update.mutate({ id: pageId, patch: { emoji } })}
          className="h-14 w-14 text-4xl"
        />
        <textarea
          value={title}
          onChange={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          rows={1}
          dir="auto"
          placeholder="Untitled"
          className="placeholder:text-muted-foreground/50 font-heading [field-sizing:content] w-full resize-none overflow-hidden border-none bg-transparent px-0 text-4xl leading-tight font-bold tracking-tight break-words outline-none"
        />
      </div>

      {/* Body — keyed on the page id so it mounts fresh per page. */}
      <PageBodyEditor key={page.id} initialContent={page.content} onChange={saveContent} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete this page?</DialogTitle>
            <DialogDescription>
              This permanently removes the page and its content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={del.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {del.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
