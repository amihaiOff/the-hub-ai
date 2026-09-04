/**
 * Unit tests for the route-title helpers.
 *
 * `isKnownRoutePath` gets the bulk of the attention because it's a security-ish
 * predicate: the favourites POST route uses it to decide what may be stored,
 * and the drawer uses it to decide what to grey out. `defaultTitleForPath` is
 * covered for its fallback ladder — it can never fail, which is exactly why the
 * predicate has to exist separately.
 */

import { defaultTitleForPath, isKnownRoutePath } from '../page-titles';

describe('isKnownRoutePath', () => {
  it.each([
    ['/', 'dashboard root'],
    ['/tasks', 'top-level nav item'],
    ['/budget/transactions', 'nav sub-item'],
    ['/labs/ai-usage', 'labs sub-item'],
    ['/settings', 'settings item'],
    ['/settings/household', 'settings subpage'],
  ])('is true for %s (%s)', (path) => {
    expect(isKnownRoutePath(path)).toBe(true);
  });

  it.each([
    ['/areas/abc123', 'dynamic Areas page — stored as an FK instead'],
    ['/wiki/abc123', 'dynamic wiki entry — not favouritable'],
    ['/nonsense', 'no such route'],
    ['/budget/transactions/', 'unnormalised trailing slash'],
    ['', 'empty string'],
  ])('is false for %s (%s)', (path) => {
    expect(isKnownRoutePath(path)).toBe(false);
  });

  it('does not treat inherited Object.prototype keys as routes', () => {
    expect(isKnownRoutePath('toString')).toBe(false);
    expect(isKnownRoutePath('constructor')).toBe(false);
  });
});

describe('defaultTitleForPath', () => {
  it('uses the nav label for a registered path', () => {
    expect(defaultTitleForPath('/tasks')).toBe('Tasks');
    expect(defaultTitleForPath('/budget/transactions')).toBe('Transactions');
  });

  it('uses the settings subpage label', () => {
    expect(defaultTitleForPath('/settings/household')).toBe('Household');
  });

  it('falls back to "Areas" for a dynamic Areas page', () => {
    expect(defaultTitleForPath('/areas/abc123')).toBe('Areas');
  });

  it('falls back to a prettified last segment for an unknown path', () => {
    expect(defaultTitleForPath('/some/deep_route-here')).toBe('Deep Route Here');
  });

  it('returns Dashboard for the root', () => {
    expect(defaultTitleForPath('/')).toBe('Dashboard');
  });
});
