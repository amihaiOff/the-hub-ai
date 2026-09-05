import type { LucideIcon } from 'lucide-react';
import { navItems, settingsItem, isNavHeader, type NavItem } from '@/lib/constants/navigation';

/**
 * Flat `path → label` and `path → icon` maps derived from `navItems`
 * (+ subItems, + Settings). Built in a single pass over the registry so the
 * two views can never drift apart if a nav entry's shape changes.
 */
const [NAV_LABEL_BY_PATH, NAV_ICON_BY_PATH] = (() => {
  const labels: Record<string, string> = {};
  const icons: Record<string, LucideIcon> = {};
  const addItem = (item: NavItem) => {
    labels[item.href] = item.label;
    icons[item.href] = item.icon;
    for (const sub of item.subItems ?? []) {
      labels[sub.href] = sub.label;
      icons[sub.href] = sub.icon;
    }
  };
  for (const entry of navItems) if (!isNavHeader(entry)) addItem(entry);
  addItem(settingsItem);
  return [labels, icons] as const;
})();

/**
 * The nav icon for a route, so a route favourite shows the same glyph it has
 * in the sidebar (Tasks → checklist, Transactions → arrows) instead of a
 * generic file icon. Returns null for paths with no registered nav icon (the
 * caller falls back to a default).
 */
export function iconForPath(path: string): LucideIcon | null {
  return Object.hasOwn(NAV_ICON_BY_PATH, path) ? NAV_ICON_BY_PATH[path] : null;
}

const SETTINGS_SUBPAGES: Record<string, string> = {
  '/settings/household': 'Household',
  '/settings/profiles': 'Profiles',
  '/settings/budget': 'Budget settings',
  '/settings/data-sync': 'Data sync',
  '/settings/wiki-prompt': 'Wiki prompt',
};

/**
 * Best-guess title for a route so newly-opened tabs get a sensible label
 * before the page finishes mounting and updates `document.title`. The tab
 * bar re-reads `document.title` after each navigation, so pages that set
 * a specific title (e.g. an Areas page named "Roadmap") show that
 * eventually.
 */
export function defaultTitleForPath(path: string): string {
  // `Object.hasOwn`, not a bare index/`in`: both maps are plain object
  // literals, so `'toString'` and friends would otherwise resolve off
  // Object.prototype and be reported as real routes.
  if (Object.hasOwn(NAV_LABEL_BY_PATH, path)) return NAV_LABEL_BY_PATH[path];
  if (Object.hasOwn(SETTINGS_SUBPAGES, path)) return SETTINGS_SUBPAGES[path];
  if (path.startsWith('/areas')) return 'Areas';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/budget')) return 'Budget';
  if (path.startsWith('/labs')) return 'Labs';
  if (path === '/') return 'Dashboard';
  // Fall back to the last path segment, prettified.
  const seg = path.split('/').filter(Boolean).pop() ?? 'Page';
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * True when `path` still maps to a real, nav-registered destination.
 *
 * `defaultTitleForPath` above can never answer this — it always succeeds,
 * falling back to a prettified last segment — so anything that needs to know
 * whether a stored path is still *alive* has to ask this instead.
 *
 * Used by the favourites drawer in three places: to reject unfavouritable
 * paths at write time, to disable the "star this page" control, and to grey
 * out a favourite whose route was later removed from the app. Because writes
 * are validated, a stored route is known-good by construction and the greyed
 * state only ever appears after a code change drops a nav entry.
 *
 * Deliberately excludes dynamic content routes (`/areas/<id>`, `/wiki/<id>`):
 * those are either stored as a typed FK instead (Areas pages) or are not
 * favouritable.
 */
export function isKnownRoutePath(path: string): boolean {
  return Object.hasOwn(NAV_LABEL_BY_PATH, path) || Object.hasOwn(SETTINGS_SUBPAGES, path);
}
