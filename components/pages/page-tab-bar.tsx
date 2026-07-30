'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
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
}

/**
 * Bottom tab switcher for an Areas page. Rendered through a portal to
 * `document.body` so its `position: fixed` is always resolved against
 * the viewport — the editor subtree contains transformed / scroll
 * ancestors that would otherwise make a nested fixed bar sit at the
 * content bottom instead of staying pinned. A right-side chevron
 * horizontally collapses the tabs into a small pill parked at the
 * right edge so the user can uncover the content beneath. Fast 150ms
 * animation to keep the interaction snappy on touch.
 */
export function PageTabBar({ tabs, activeTabId, onSelect }: PageTabBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Only rendered client-side by PageEditor (behind its isLoading guard), so
  // document is always defined here.
  return createPortal(
    <nav
      aria-label="Page tabs"
      // Bottom clearance adapts to browser vs installed-PWA — see
      // `.page-tab-bar-pb` in globals.css. Right-anchored when collapsed
      // so the pill parks against the edge; centered when expanded.
      className={cn(
        'page-tab-bar-pb fixed inset-x-0 bottom-0 z-50 flex px-2 lg:left-64',
        collapsed ? 'justify-end' : 'justify-center'
      )}
    >
      <div className="border-border/60 bg-background/95 flex max-w-full items-center rounded-2xl border py-1 pr-1 shadow-lg backdrop-blur-lg">
        <div
          className={cn(
            'flex items-center gap-1 overflow-hidden transition-[max-width,padding,opacity] duration-150 ease-out',
            collapsed ? 'max-w-0 pl-0 opacity-0' : 'max-w-[95vw] pl-1 opacity-100'
          )}
          aria-hidden={collapsed}
        >
          {tabs.map((tab, i) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'max-w-[45vw] shrink-0 truncate rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tabLabel(tab, i)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand tab bar' : 'Collapse tab bar'}
          className="text-foreground hover:bg-muted/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        >
          {collapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
    </nav>,
    document.body
  );
}
