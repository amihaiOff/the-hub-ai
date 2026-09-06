import { isEmptyCellValue, getSelectColor, resolveOptionColor, SELECT_COLORS } from '../db-cells';

/**
 * Pure, render-free helpers from db-cells. These back view logic that has no
 * other coverage: `isEmptyCellValue` drives the Cards "hide empty fields" filter
 * and the Kanban chip filter, while the color resolvers decide which pill swatch
 * a select option gets (including the legacy no-color-stored fallback).
 */
describe('isEmptyCellValue', () => {
  it('treats null / undefined / empty string / empty array as empty', () => {
    expect(isEmptyCellValue(null)).toBe(true);
    expect(isEmptyCellValue(undefined as never)).toBe(true);
    expect(isEmptyCellValue('')).toBe(true);
    expect(isEmptyCellValue([])).toBe(true);
  });

  it('treats any populated scalar or array as non-empty', () => {
    expect(isEmptyCellValue('x')).toBe(false);
    expect(isEmptyCellValue(['o1'])).toBe(false);
    expect(isEmptyCellValue(0)).toBe(false); // 0 is a real number, not empty
    expect(isEmptyCellValue(false)).toBe(false); // unchecked checkbox still shows
  });
});

describe('getSelectColor', () => {
  it('returns the matching palette entry by key', () => {
    expect(getSelectColor('blue').key).toBe('blue');
    expect(getSelectColor('rose').key).toBe('rose');
  });

  it('falls back to the first palette entry (slate) for unknown/undefined keys', () => {
    expect(getSelectColor('not-a-color').key).toBe(SELECT_COLORS[0].key);
    expect(getSelectColor(undefined).key).toBe(SELECT_COLORS[0].key);
    expect(SELECT_COLORS[0].key).toBe('slate');
  });
});

describe('resolveOptionColor', () => {
  it('prefers an explicitly stored color', () => {
    expect(resolveOptionColor({ color: 'emerald' }, 5).key).toBe('emerald');
  });

  it('cycles through the palette by index when no color is stored', () => {
    // Legacy options (no `color`) read as distinct swatches instead of all grey.
    expect(resolveOptionColor({}, 0).key).toBe(SELECT_COLORS[0].key);
    expect(resolveOptionColor({}, 1).key).toBe(SELECT_COLORS[1].key);
    expect(resolveOptionColor(undefined, 2).key).toBe(SELECT_COLORS[2].key);
  });

  it('wraps the index modulo palette length', () => {
    const len = SELECT_COLORS.length;
    expect(resolveOptionColor({}, len).key).toBe(SELECT_COLORS[0].key);
    expect(resolveOptionColor({}, len + 3).key).toBe(SELECT_COLORS[3].key);
  });

  it('an unknown stored color falls back to slate rather than cycling by index', () => {
    // A stored-but-invalid color takes the getSelectColor path, not the index path.
    expect(resolveOptionColor({ color: 'bogus' }, 4).key).toBe(SELECT_COLORS[0].key);
  });
});
