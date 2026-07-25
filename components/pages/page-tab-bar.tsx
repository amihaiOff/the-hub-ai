'use client';

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
 * bar). Fixed to the viewport bottom; on desktop it clears the sidebar
 * (`lg:left-64`). Horizontally scrollable so many tabs stay reachable.
 */
export function PageTabBar({ tabs, activeTabId, onSelect }: PageTabBarProps) {
  return (
    <nav
      aria-label="Page tabs"
      className="safe-pb border-border/30 bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-lg lg:left-64"
    >
      <div className="flex items-stretch gap-1 overflow-x-auto px-2 py-1">
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
    </nav>
  );
}
