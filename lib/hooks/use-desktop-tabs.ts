'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * A browser-style desktop tab: id, current path, and a friendly title.
 * Kept small so localStorage stays tiny even with many tabs open.
 */
export interface DesktopTab {
  id: string;
  path: string;
  title: string;
}

interface DesktopTabsState {
  tabs: DesktopTab[];
  activeTabId: string | null;
  /** Open a new tab pointing to `path`. Returns the new tab's id. */
  openTab: (path: string, title: string) => string;
  /** Close a tab by id. If it was active, activate an adjacent tab. */
  closeTab: (id: string) => void;
  /** Set which tab is active (doesn't route). */
  setActiveTab: (id: string) => void;
  /** Reorder: move `fromIndex` to `toIndex`. No-op on out-of-range. */
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  /**
   * Sync the active tab's path/title to the current route. If no tab
   * matches the path anywhere in the list, either create a new one
   * (when no tab is active) or update the active tab in place (default,
   * so link-clicks stay inside the current tab).
   */
  syncActiveToRoute: (path: string, title: string) => void;
  /**
   * Update just the active tab's title. Called by pages that know their
   * own title (e.g. Areas pages loading a page named "Roadmap"). No-op
   * when there's no active tab.
   */
  setActiveTabTitle: (title: string) => void;
}

/** Short random-ish id — collision-free enough for a per-browser tab list. */
function makeId(): string {
  return `tab_${Math.random().toString(36).slice(2, 10)}`;
}

export const useDesktopTabs = create<DesktopTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (path, title) => {
        const id = makeId();
        set((state) => ({ tabs: [...state.tabs, { id, path, title }], activeTabId: id }));
        return id;
      },

      closeTab: (id) => {
        set((state) => {
          const idx = state.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return state;
          const nextTabs = state.tabs.filter((t) => t.id !== id);
          let nextActive = state.activeTabId;
          if (state.activeTabId === id) {
            // Prefer the tab that took the closed tab's slot; otherwise the
            // one just before it; otherwise null (no tabs left).
            nextActive = nextTabs[idx]?.id ?? nextTabs[idx - 1]?.id ?? null;
          }
          return { tabs: nextTabs, activeTabId: nextActive };
        });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      reorderTabs: (fromIndex, toIndex) => {
        set((state) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.tabs.length ||
            toIndex >= state.tabs.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const next = state.tabs.slice();
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { tabs: next };
        });
      },

      syncActiveToRoute: (path, title) => {
        const { tabs, activeTabId } = get();

        // No tabs yet → create the first one for this route.
        if (tabs.length === 0) {
          const id = makeId();
          set({ tabs: [{ id, path, title }], activeTabId: id });
          return;
        }

        // Active tab already on this path — just refresh its title.
        const active = tabs.find((t) => t.id === activeTabId);
        if (active && active.path === path) {
          if (active.title !== title) {
            set({
              tabs: tabs.map((t) => (t.id === active.id ? { ...t, title } : t)),
            });
          }
          return;
        }

        // No active tab (e.g. after closing the last one) — create a new one.
        if (!active) {
          const id = makeId();
          set({ tabs: [...tabs, { id, path, title }], activeTabId: id });
          return;
        }

        // Active tab exists but points elsewhere — update it in place. This
        // is the link-follow behaviour: clicking a link inside a tab
        // navigates that tab, it doesn't spawn a new one.
        set({
          tabs: tabs.map((t) => (t.id === active.id ? { ...t, path, title } : t)),
        });
      },

      setActiveTabTitle: (title) => {
        const { tabs, activeTabId } = get();
        if (!activeTabId) return;
        const active = tabs.find((t) => t.id === activeTabId);
        if (!active || active.title === title) return;
        set({
          tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, title } : t)),
        });
      },
    }),
    {
      name: 'hubai:desktop-tabs',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
