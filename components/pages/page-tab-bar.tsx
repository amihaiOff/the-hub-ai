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
 * Bottom tab switcher for an Areas page (mirrors the budget section's bottom
 * bar). Rendered through a portal to `document.body` so its `position: fixed`
 * is always resolved against the viewport — the editor subtree contains
 * transformed / scroll ancestors that would otherwise make a nested fixed bar
 * sit at the content bottom instead of staying pinned. On desktop it clears
 * the sidebar (`lg:left-64`). Horizontally scrollable so many tabs stay
 * reachable, with a right-side chevron that collapses the whole row into just
 * the chevron so the user can uncover the content beneath. Fast 150ms
 * animation to stay snappy on touch.
 */
export function PageTabBar({ tabs, activeTabId, onSelect }: PageTabBarProps) {
  const [collapsed, setCollapsed] = useState(false);

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
        <div
          className={cn(
            'flex min-w-0 items-stretch gap-1 overflow-x-auto transition-[flex,opacity] duration-150 ease-out',
            collapsed ? 'flex-none basis-0 opacity-0' : 'flex-1 opacity-100'
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
                  'max-w-[45vw] shrink-0 truncate rounded-lg border-t-2 px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground border-transparent'
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
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 ml-auto flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg transition-colors"
        >
          {collapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
    </nav>,
    document.body
  );
}
