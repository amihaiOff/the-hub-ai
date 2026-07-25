'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreHorizontal, Plus, Trash2, ListTree } from 'lucide-react';
import {
  usePage,
  useUpdatePage,
  useDeletePage,
  useCreatePageTab,
  useUpdatePageTab,
  type PageTabRow,
} from '@/lib/hooks/use-pages';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { PageTabBar } from './page-tab-bar';
import { ManageTabsDialog } from './manage-tabs-dialog';

const SAVE_MS = 700;

export function PageEditor({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { data: page, isLoading, error } = usePage(pageId);
  const update = useUpdatePage();
  const del = useDeletePage();
  const createTab = useCreatePageTab();
  const updateTab = useUpdatePageTab();

  const [title, setTitle] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Seed local title + the active tab when the page loads / changes (tracked by
  // id so switching pages re-seeds without fighting in-flight edits). React's
  // "adjust state during render" pattern.
  const [seededId, setSeededId] = useState<string | null>(null);
  if (page && seededId !== page.id) {
    setSeededId(page.id);
    setTitle(page.title);
    setActiveTabId(page.tabs[0]?.id ?? null);
  }

  const tabs = page?.tabs ?? [];
  // Resolve the active tab defensively — falls back to the first tab if the
  // current selection was deleted.
  const activeTab: PageTabRow | undefined = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const activeTabIdResolved = activeTab?.id ?? null;

  // ── Page-level autosave (title / emoji) ────────────────────────────────
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
      if (pending.current && pending.current.id !== pageId) flush();
      pending.current = { id: pageId, patch: { ...pending.current?.patch, ...patch } };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_MS);
    },
    [pageId, flush]
  );

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

  // ── Tab-content autosave (per active tab) ──────────────────────────────
  const tabPending = useRef<{ pageId: string; tabId: string; content: unknown } | null>(null);
  const tabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTab = useCallback(() => {
    if (tabTimer.current) {
      clearTimeout(tabTimer.current);
      tabTimer.current = null;
    }
    const p = tabPending.current;
    tabPending.current = null;
    if (p) updateTab.mutate({ pageId: p.pageId, tabId: p.tabId, patch: { content: p.content } });
  }, [updateTab]);

  const saveTabContent = useCallback(
    (doc: unknown) => {
      const tabId = activeTabIdResolved;
      if (!tabId) return;
      // Flush a pending edit for a different tab before queuing this one.
      if (tabPending.current && tabPending.current.tabId !== tabId) flushTab();
      tabPending.current = { pageId, tabId, content: doc };
      if (tabTimer.current) clearTimeout(tabTimer.current);
      tabTimer.current = setTimeout(flushTab, SAVE_MS);
    },
    [pageId, activeTabIdResolved, flushTab]
  );

  // Flush the outgoing tab's pending content when the page or active tab
  // changes, or on unmount, so switching never drops the last edit.
  const flushTabRef = useRef(flushTab);
  useEffect(() => {
    flushTabRef.current = flushTab;
  }, [flushTab]);
  useEffect(() => () => flushTabRef.current(), [pageId, activeTabIdResolved]);

  const selectTab = useCallback(
    (tabId: string) => {
      flushTab();
      setActiveTabId(tabId);
    },
    [flushTab]
  );

  const handleAddTab = useCallback(() => {
    // Flush the current tab's pending edit before switching away from it.
    flushTab();
    createTab.mutate(
      { pageId },
      { onSuccess: (tab) => setActiveTabId(tab.id) }
    );
  }, [createTab, pageId, flushTab]);

  const handleDelete = () => {
    del.mutate(pageId, {
      onSuccess: () => {
        setConfirmOpen(false);
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

  const hasTabBar = tabs.length >= 2;
  const saving = update.isPending || updateTab.isPending || createTab.isPending;
  const saveError = update.isError || updateTab.isError;

  return (
    <div className={`mx-auto max-w-3xl space-y-4 ${hasTabBar ? 'pb-36' : 'pb-24'}`}>
      {/* Top bar: save status + overflow menu. */}
      <div className="flex items-center justify-end gap-3">
        {saveError ? (
          <span className="text-destructive text-xs">Couldn&apos;t save — check your connection</span>
        ) : saving ? (
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
              className="rounded-lg text-sm"
              onSelect={handleAddTab}
              disabled={createTab.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add tab
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg text-sm" onSelect={() => setManageOpen(true)}>
              <ListTree className="mr-2 h-4 w-4" />
              Manage tabs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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

      {/* Body — keyed on page id + active tab so it mounts fresh per tab and
          reads that tab's content exactly once. */}
      {activeTab && (
        <PageBodyEditor
          key={`${page.id}:${activeTab.id}`}
          initialContent={activeTab.content}
          onChange={saveTabContent}
          hasBottomTabBar={hasTabBar}
        />
      )}

      {/* Bottom tab bar — only when there's more than one tab. */}
      {hasTabBar && activeTab && (
        <PageTabBar tabs={tabs} activeTabId={activeTab.id} onSelect={selectTab} />
      )}

      <ManageTabsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        pageId={pageId}
        tabs={tabs}
        activeTabId={activeTab?.id ?? null}
        onActiveTabChange={setActiveTabId}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete this page?</DialogTitle>
            <DialogDescription>
              This permanently removes the page and all of its tabs.
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
