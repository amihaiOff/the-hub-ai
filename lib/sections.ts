import { z } from 'zod';

/**
 * App sections a household member can be limited to (HouseholdMember.allowedSections).
 * An empty list = unrestricted. A restricted member reaches only the pages and
 * APIs of their sections plus ALWAYS_ALLOWED; everything unlisted here
 * (settings, labs, backup/restore, debug, onboarding, household admin) is denied.
 * Shared by the server guard (lib/auth-utils.ts) and the client nav/route guard.
 */
export const SECTIONS = {
  dashboard: { label: 'Dashboard', pages: ['/'], api: ['/api/dashboard', '/api/favorites'] },
  finances: {
    label: 'Finances',
    // First page = landing page for a member limited to this section.
    pages: ['/budget', '/portfolio', '/pension', '/assets', '/insurance'],
    api: [
      '/api/portfolio',
      '/api/pension',
      '/api/assets',
      '/api/insurance',
      '/api/budget',
      '/api/moneytor',
      '/api/stocks',
      '/api/exchange-rates',
      // Settings / labs endpoints the budget pages call directly.
      '/api/settings/report-prompt',
      '/api/settings/billing-cycle',
      '/api/settings/partner-contacts',
      '/api/labs/ai-usage',
    ],
  },
  shopping: { label: 'Shopping', pages: ['/shopping'], api: ['/api/shopping'] },
  tasks: {
    label: 'Tasks',
    pages: ['/tasks'],
    api: ['/api/tasks', '/api/task-categories', '/api/task-tags'],
  },
  habits: { label: 'Habits', pages: ['/habits'], api: ['/api/habits'] },
  wiki: { label: 'Wiki', pages: ['/wiki'], api: ['/api/wiki'] },
  areas: { label: 'Areas', pages: ['/areas'], api: ['/api/pages'] },
} as const;

export type SectionId = keyof typeof SECTIONS;
export const SECTION_IDS = Object.keys(SECTIONS) as [SectionId, ...SectionId[]];

/** API input for a member's / invite's section list. Empty = everything. */
export const allowedSectionsSchema = z.array(z.enum(SECTION_IDS)).max(SECTION_IDS.length);

/** Infrastructure every signed-in page needs, whatever the sections. */
const ALWAYS_ALLOWED = ['/api/context', '/api/profiles', '/api/push', '/api/auth', '/handler'];

function matches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function isRestricted(allowedSections: readonly string[] | null | undefined): boolean {
  return !!allowedSections && allowedSections.length > 0;
}

/** Can a member with `allowedSections` reach this page or API path? */
export function canAccessPath(
  pathname: string,
  allowedSections: readonly string[] | null | undefined
): boolean {
  if (!isRestricted(allowedSections)) return true;
  if (ALWAYS_ALLOWED.some((p) => matches(pathname, p))) return true;
  return allowedSections!.some((id) => {
    const section = SECTIONS[id as SectionId];
    return !!section && [...section.pages, ...section.api].some((p) => matches(pathname, p));
  });
}

/** Where to send a restricted member who lands on a page they can't see. */
export function firstAllowedPage(allowedSections: readonly string[]): string {
  const first = SECTION_IDS.find((id) => allowedSections.includes(id));
  return first ? SECTIONS[first].pages[0] : '/';
}
