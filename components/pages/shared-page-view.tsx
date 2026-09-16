'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSharedPage, useUpdateSharedPageTab } from '@/lib/hooks/use-shared-page';
import { PageBodyEditor } from './page-body-editor-lazy';
import { PageTabBar } from './page-tab-bar';

const SAVE_MS = 700;

/**
 * Public, no-session view for a page shared via /share/[token]. Deliberately
 * minimal next to PageEditor: no overflow menu, no delete, no rename/reorder
 * of tabs, no sharing controls — none of that is this visitor's to touch.
 * `editable` (from the page's own `shareAccess`) is the only thing that
 * changes: 'view' renders PageBodyEditor read-only, 'edit' wires the same
 * debounced-save pattern PageEditor uses, just against the public endpoint.
 */
export function SharedPageView({ token }: { token: string }) {
  const { data: page, isLoading, error } = useSharedPage(token);
  const updateTab = useUpdateSharedPageTab(token);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [seededId, setSeededId] = useState<string | null>(null);
  if (page && seededId !== page.id) {
    setSeededId(page.id);
    setActiveTabId(page.tabs[0]?.id ?? null);
  }

  const tabs = page?.tabs ?? [];
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const editable = page?.shareAccess === 'edit';

  // Same debounced tab-content save as PageEditor.saveTabContent.
  const pending = useRef<{ tabId: string; content: unknown } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    pending.current = null;
    if (p) updateTab.mutate({ tabId: p.tabId, patch: { content: p.content } });
  }, [updateTab]);
  const saveTabContent = useCallback(
    (doc: unknown) => {
      const tabId = activeTab?.id;
      if (!tabId || !editable) return;
      if (pending.current && pending.current.tabId !== tabId) flush();
      pending.current = { tabId, content: doc };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_MS);
    },
    [activeTab?.id, editable, flush]
  );
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => flushRef.current(), [token]);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-20 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error || !page) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-foreground text-lg font-semibold">This link doesn&apos;t work</p>
        <p className="text-muted-foreground mt-1 text-sm">
          It may have been turned off, or never existed.
        </p>
      </div>
    );
  }

  const hasTabBar = tabs.length >= 2;

  return (
    <div className={`mx-auto max-w-3xl space-y-4 ${hasTabBar ? 'pb-36' : 'pb-24'} px-4 pt-8`}>
      {editable && (
        <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5 text-center text-xs">
          Anyone with this link can edit this page.
        </p>
      )}

      <div className="space-y-2">
        {page.emoji && <div className="text-4xl">{page.emoji}</div>}
        <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight break-words">
          {page.title || 'Untitled'}
        </h1>
      </div>

      {activeTab && (
        <PageBodyEditor
          key={`${page.id}:${activeTab.id}`}
          initialContent={activeTab.content}
          onChange={saveTabContent}
          hasBottomTabBar={hasTabBar}
          autoCapitalize={page.autoCapitalize ?? true}
          editable={editable}
        />
      )}

      {hasTabBar && activeTab && (
        <PageTabBar tabs={tabs} activeTabId={activeTab.id} onSelect={setActiveTabId} />
      )}
    </div>
  );
}
