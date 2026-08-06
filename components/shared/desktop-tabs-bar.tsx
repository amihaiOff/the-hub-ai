'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDesktopTabs, type DesktopTab } from '@/lib/hooks/use-desktop-tabs';
import { defaultTitleForPath } from '@/lib/utils/page-titles';

/**
 * Desktop-only browser-style tab bar. Sits above the main content on
 * `lg:` viewports and lets the user keep multiple pages "open" in the
 * app. Tabs persist across reloads via localStorage.
 *
 * URL model: the URL always points to the currently-active tab's path.
 * Following a link inside a tab updates that tab's path in place — it
 * doesn't spawn a new tab. Cmd+T (or Ctrl+T on Windows/Linux) opens a
 * duplicate of the current tab; Cmd+W closes it. In desktop browsers
 * those two shortcuts are reserved for the browser itself, so Cmd/Ctrl
 * +Shift+T / +Shift+W work as reliable fallbacks (and are the only
 * variants that fire outside PWA-standalone mode).
 *
 * Reorder: hold and drag a tab left/right. dnd-kit animates the shuffle
 * via the CSS transform it applies to each sortable item.
 */
export function DesktopTabsBar() {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = useDesktopTabs((s) => s.tabs);
  const activeTabId = useDesktopTabs((s) => s.activeTabId);
  const openTab = useDesktopTabs((s) => s.openTab);
  const closeTab = useDesktopTabs((s) => s.closeTab);
  const setActiveTab = useDesktopTabs((s) => s.setActiveTab);
  const reorderTabs = useDesktopTabs((s) => s.reorderTabs);
  const syncActiveToRoute = useDesktopTabs((s) => s.syncActiveToRoute);

  // Sync the active tab whenever the pathname changes, using the default
  // title for now — a page component that later sets document.title (e.g.
  // an Areas page rendering the page's own title) triggers the observer
  // below and refines the tab label.
  useEffect(() => {
    syncActiveToRoute(pathname, defaultTitleForPath(pathname));
    // We WANT to run on every pathname change — the store dedupes no-op writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Watch document.title. Pages that set their own title (Areas pages set
  // the page's title; other routes may set a route-specific title later)
  // update the active tab's label as soon as the change lands.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    const apply = () => {
      const raw = document.title.trim();
      if (!raw) return;
      // Strip a common "The Hub" prefix if the layout ever adds one.
      const stripped = raw.replace(/^The Hub[·\-—:\s]*/i, '').trim() || raw;
      syncActiveToRoute(pathname, stripped);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(titleEl, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Route to the active tab's path when it changes (user clicked a tab).
  const lastRoutedPath = useRef<string | null>(null);
  useEffect(() => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active) return;
    if (active.path === pathname) {
      lastRoutedPath.current = active.path;
      return;
    }
    if (active.path === lastRoutedPath.current) return;
    lastRoutedPath.current = active.path;
    router.push(active.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tabs]);

  // Keyboard shortcuts. Cmd/Ctrl+T duplicates the current tab; Cmd/Ctrl+W
  // closes it. Cmd/Ctrl+Shift+T / +W as browser-safe fallbacks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        const active = tabs.find((t) => t.id === activeTabId);
        if (active) openTab(active.path, active.title);
      } else if (key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, activeTabId, openTab, closeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Only start dragging after a small threshold so single clicks (to
      // activate a tab) still work.
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = tabs.findIndex((t) => t.id === active.id);
    const toIndex = tabs.findIndex((t) => t.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    reorderTabs(fromIndex, toIndex);
  };

  const tabIds = tabs.map((t) => t.id);

  return (
    <div
      className={cn(
        // Chrome-style tab strip: subtly darker "chrome" bar with the active
        // tab lifted onto it. `bg-muted/60` reads as the browser chrome;
        // active tabs use `bg-background` so they connect visually to the
        // main content area below. Bottom border merges via the active tab
        // (see the ::after trick isn't needed — the active tab spans the
        // full height so its bottom rests flush with the content border).
        'border-border/40 bg-muted/60 fixed top-0 right-0 left-64 z-40 hidden h-10 items-end gap-0.5 border-b px-2 pt-1 backdrop-blur-lg lg:flex'
      )}
      role="tablist"
      aria-label="Open pages"
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                canClose={tabs.length > 1}
                onSelect={() => setActiveTab(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={() => {
          const active = tabs.find((t) => t.id === activeTabId);
          const path = active?.path ?? pathname ?? '/';
          const title = active?.title ?? defaultTitleForPath(path);
          openTab(path, title);
        }}
        aria-label="New tab"
        title="New tab (⌘T)"
        className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function SortableTab({
  tab,
  isActive,
  canClose,
  onSelect,
  onClose,
}: {
  tab: DesktopTab;
  isActive: boolean;
  canClose: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  // dnd-kit handles the shuffle animation via `transition` on siblings —
  // we just apply the transform each render.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      className={cn(
        // Chrome-style tab shape: rounded-top, flat bottom that meets the
        // content border. Active tab uses bg-background so it visually
        // connects to the content area below (the small pt-1 on the bar
        // container gives a hairline of chrome above every tab).
        // `-mb-px` pulls the tab 1px below the container so the active
        // tab's fill covers the bar's border-b — mimics Chrome's connected
        // tab / content seam.
        'group -mb-px flex h-8 max-w-[220px] min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg px-3 text-sm transition-colors',
        isActive
          ? 'bg-background text-foreground shadow-[0_-1px_2px_rgba(0,0,0,0.08)]'
          : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
      )}
      title={tab.title}
    >
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      {canClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Close ${tab.title}`}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity',
            'hover:bg-muted-foreground/20',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// arrayMove is re-exported by dnd-kit/sortable; using it here would let us
// preview drags without dispatching to the store on every over-event. Not
// needed today — the reorder is committed on dragEnd — but leaving the
// import here documents where to reach for it if we later want live
// preview.
void arrayMove;
