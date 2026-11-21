/**
 * Unit tests for lib/sections.ts — the section map shared by the server
 * guard (lib/auth-utils.ts) and the client nav/route guard.
 */

import {
  SECTIONS,
  SECTION_IDS,
  allowedSectionsSchema,
  canAccessPath,
  firstAllowedPage,
  isRestricted,
} from '../sections';

describe('isRestricted', () => {
  it.each([
    [undefined, false],
    [null, false],
    [[], false],
    [['shopping'], true],
  ])('%p → %p', (input, expected) => {
    expect(isRestricted(input as string[] | null | undefined)).toBe(expected);
  });
});

describe('canAccessPath', () => {
  describe('unrestricted', () => {
    it.each([[], null, undefined])('allows everything for %p', (allowed) => {
      for (const p of ['/', '/settings', '/api/backup', '/labs/sync-log', '/api/tasks']) {
        expect(canAccessPath(p, allowed as string[] | null | undefined)).toBe(true);
      }
    });
  });

  describe('restricted', () => {
    const finances = ['finances'];

    it('allows the section pages and their sub-pages', () => {
      expect(canAccessPath('/budget', finances)).toBe(true);
      expect(canAccessPath('/budget/transactions', finances)).toBe(true);
      expect(canAccessPath('/portfolio', finances)).toBe(true);
      expect(canAccessPath('/insurance/moneytor', finances)).toBe(true);
    });

    it('allows the section APIs and nested routes', () => {
      expect(canAccessPath('/api/portfolio', finances)).toBe(true);
      expect(canAccessPath('/api/portfolio/accounts/abc/cash', finances)).toBe(true);
      expect(canAccessPath('/api/settings/billing-cycle', finances)).toBe(true);
      expect(canAccessPath('/api/labs/ai-usage', finances)).toBe(true);
    });

    it('denies other sections and unlisted areas', () => {
      for (const p of [
        '/tasks',
        '/api/tasks',
        '/settings',
        '/settings/household',
        '/api/households/x/members',
        '/api/backup',
        '/api/restore',
        '/labs/sync-log',
        '/api/labs/general-log/unread-count',
        '/api/settings/other',
        '/onboarding',
      ]) {
        expect(canAccessPath(p, finances)).toBe(false);
      }
    });

    it.each([
      '/api/context',
      '/api/profiles',
      '/api/push/subscribe',
      '/api/auth/x',
      '/handler/sign-in',
    ])('always allows infrastructure path %s', (p) => {
      expect(canAccessPath(p, ['shopping'])).toBe(true);
    });

    it('does not treat a shared prefix as a match (/api/budgeting ≠ /api/budget)', () => {
      expect(canAccessPath('/api/budget', finances)).toBe(true);
      expect(canAccessPath('/api/budget/x', finances)).toBe(true);
      expect(canAccessPath('/api/budgeting', finances)).toBe(false);
      expect(canAccessPath('/budgeting', finances)).toBe(false);
      expect(canAccessPath('/api/contextual', ['shopping'])).toBe(false);
      expect(canAccessPath('/shoppingx', ['shopping'])).toBe(false);
    });

    it("matches '/' only exactly (dashboard doesn't open the whole app)", () => {
      const dashboard = ['dashboard'];
      expect(canAccessPath('/', dashboard)).toBe(true);
      expect(canAccessPath('/tasks', dashboard)).toBe(false);
      expect(canAccessPath('/settings', dashboard)).toBe(false);
      expect(canAccessPath('/api/dashboard/history', dashboard)).toBe(true);
      expect(canAccessPath('/api/favorites', dashboard)).toBe(true);
    });

    it("does not let a non-dashboard member reach '/'", () => {
      expect(canAccessPath('/', ['shopping'])).toBe(false);
    });

    it('ignores unknown section ids', () => {
      expect(canAccessPath('/tasks', ['bogus'])).toBe(false);
      expect(canAccessPath('/tasks', ['bogus', 'tasks'])).toBe(true);
    });

    // KNOWN BUG (reported, not fixed here): SECTIONS[id] is a plain-object
    // lookup, so a prototype key such as 'constructor' resolves to a function
    // and `section.pages` throws. The API validates ids via
    // allowedSectionsSchema, but /api/restore copies allowedSections from the
    // backup unvalidated. Flip to `it` once canAccessPath uses Object.hasOwn.
    it.failing('treats prototype keys as unknown section ids', () => {
      expect(canAccessPath('/tasks', ['constructor'])).toBe(false);
    });

    it('unions multiple sections', () => {
      const allowed = ['shopping', 'wiki'];
      expect(canAccessPath('/shopping/items', allowed)).toBe(true);
      expect(canAccessPath('/api/wiki/page', allowed)).toBe(true);
      expect(canAccessPath('/api/habits', allowed)).toBe(false);
    });
  });
});

describe('firstAllowedPage', () => {
  it('finances → /budget (its first page)', () => {
    expect(firstAllowedPage(['finances'])).toBe('/budget');
  });

  it('follows SECTIONS order, not the input order', () => {
    expect(firstAllowedPage(['wiki', 'shopping'])).toBe('/shopping');
    expect(firstAllowedPage(['areas', 'dashboard'])).toBe('/');
  });

  it("falls back to '/' for no / unknown sections", () => {
    expect(firstAllowedPage([])).toBe('/');
    expect(firstAllowedPage(['bogus'])).toBe('/');
  });

  it('every section landing page is accessible to that section', () => {
    for (const id of SECTION_IDS) {
      expect(canAccessPath(firstAllowedPage([id]), [id])).toBe(true);
    }
  });
});

describe('allowedSectionsSchema', () => {
  it('accepts known ids and the empty list', () => {
    expect(allowedSectionsSchema.safeParse([]).success).toBe(true);
    expect(allowedSectionsSchema.safeParse(['finances', 'shopping']).success).toBe(true);
  });

  it('rejects unknown ids and non-arrays', () => {
    expect(allowedSectionsSchema.safeParse(['settings']).success).toBe(false);
    expect(allowedSectionsSchema.safeParse('finances').success).toBe(false);
  });

  it('caps the list length at the number of sections', () => {
    expect(allowedSectionsSchema.safeParse([...SECTION_IDS]).success).toBe(true);
    expect(allowedSectionsSchema.safeParse([...SECTION_IDS, 'tasks']).success).toBe(false);
  });

  it('SECTION_IDS mirrors SECTIONS', () => {
    expect([...SECTION_IDS].sort()).toEqual(Object.keys(SECTIONS).sort());
  });
});
