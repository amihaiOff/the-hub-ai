'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageTabRow } from '@/lib/hooks/use-pages';

/** Visible label for a tab — falls back to "Tab N" when the title is empty. */
export function tabLabel(tab: Pick<PageTabRow, 'title'>, index: number): string {
  return tab.title.trim() || `Tab ${index + 1}`;
}

interface PageTabBarProps {
  tabs: PageTabRow[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  /** Called when a tab is double-clicked and renamed inline. */
  onRename?: (tabId: string, title: string) => void;
  /** Called with the new tab-id order after a drag-reorder. */
  onReorder?: (orderedIds: string[]) => void;
}

/**
 * Bottom tab switcher for an Areas page. Portalled to <body> so the
 * fixed positioning resolves against the viewport rather than any
 * transformed ancestor in the editor subtree.
 *
 * Interactions:
 *   - Click a tab: switch to it.
 *   - Double-click a tab: rename inline (input replaces the label).
 *   - Drag a tab: reorder (dnd-kit sortable, horizontal strategy, animated).
 *   - Right-side chevron: horizontally collapses the whole row.
 */
export function PageTabBar({ tabs, activeTabId, onSelect, onRename, onReorder }: PageTabBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Only start dragging once the pointer has actually moved a little;
      // otherwise single clicks (to switch) and double clicks (to rename)
      // would fire drag start on mousedown.
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const fromIndex = tabs.findIndex((t) => t.id === active.id);
    const toIndex = tabs.findIndex((t) => t.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    const orderedIds = arrayMove(tabs, fromIndex, toIndex).map((t) => t.id);
    onReorder(orderedIds);
  };

  const tabIds = tabs.map((t) => t.id);

  // Only rendered client-side by PageEditor (behind its isLoading guard), so
  // document is always defined here.
  return createPortal(
    <nav
      aria-label="Page tabs"
      // Bottom clearance adapts to browser vs installed-PWA — see
      // `.page-tab-bar-pb` in globals.css.
      className="page-tab-bar-pb border-border/30 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:left-64"
    >
      <div className="flex items-stretch gap-1 pt-1 pr-1 pl-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div
              className={cn(
                'flex min-w-0 items-stretch gap-1 overflow-x-auto transition-[flex,opacity] duration-150 ease-out',
                collapsed ? 'flex-none basis-0 opacity-0' : 'flex-1 opacity-100'
              )}
              aria-hidden={collapsed}
            >
              {tabs.map((tab, i) => (
                <SortableTabButton
                  key={tab.id}
                  tab={tab}
                  index={i}
                  isActive={tab.id === activeTabId}
                  onSelect={onSelect}
                  onRename={onRename}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand tab bar' : 'Collapse tab bar'}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 ml-auto flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg transition-colors"
        >
          {collapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
    </nav>,
    document.body
  );
}

function SortableTabButton({
  tab,
  index,
  isActive,
  onSelect,
  onRename,
}: {
  tab: PageTabRow;
  index: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename?: (id: string, title: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const commit = () => {
    const next = draft.trim();
    if (onRename && next && next !== tab.title) onRename(tab.id, next);
    setEditing(false);
  };

  const startEditing = () => {
    if (!onRename) return;
    setDraft(tab.title || tabLabel(tab, index));
    setEditing(true);
  };

  const commonCls = cn(
    'max-w-[45vw] shrink-0 truncate rounded-lg border-t-2 px-4 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'border-primary text-primary'
      : 'text-muted-foreground hover:text-foreground border-transparent'
  );

  if (editing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={commonCls}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-full min-w-[6ch] bg-transparent text-inherit outline-none"
          size={Math.max(4, draft.length + 1)}
        />
      </div>
    );
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onSelect(tab.id)}
      onDoubleClick={startEditing}
      aria-current={isActive ? 'true' : undefined}
      className={commonCls}
    >
      {tabLabel(tab, index)}
    </button>
  );
}
