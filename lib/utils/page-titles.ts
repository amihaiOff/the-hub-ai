import { navItems, settingsItem, isNavHeader, type NavItem } from '@/lib/constants/navigation';

/** Flat map of `path → label` derived from `navItems` (+ subItems, + Settings). */
const NAV_LABEL_BY_PATH: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const addItem = (item: NavItem) => {
    map[item.href] = item.label;
    for (const sub of item.subItems ?? []) map[sub.href] = sub.label;
  };
  for (const entry of navItems) if (!isNavHeader(entry)) addItem(entry);
  addItem(settingsItem);
  return map;
})();

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
  if (NAV_LABEL_BY_PATH[path]) return NAV_LABEL_BY_PATH[path];
  if (SETTINGS_SUBPAGES[path]) return SETTINGS_SUBPAGES[path];
  if (path.startsWith('/areas')) return 'Areas';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/budget')) return 'Budget';
  if (path.startsWith('/labs')) return 'Labs';
  if (path === '/') return 'Dashboard';
  // Fall back to the last path segment, prettified.
  const seg = path.split('/').filter(Boolean).pop() ?? 'Page';
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
