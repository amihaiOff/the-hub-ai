import {
  cellMatchesFilter,
  defaultFilterFor,
  isColumnFilterActive,
  type ColumnFilter,
} from '../db-filter';

describe('defaultFilterFor / isColumnFilterActive', () => {
  it('creates an inactive filter per type', () => {
    for (const type of ['text', 'number', 'date', 'select', 'checkbox'] as const) {
      expect(isColumnFilterActive(defaultFilterFor(type))).toBe(false);
    }
  });

  it('detects active state per kind', () => {
    expect(isColumnFilterActive({ kind: 'text', query: '  ' })).toBe(false);
    expect(isColumnFilterActive({ kind: 'text', query: 'x' })).toBe(true);
    expect(isColumnFilterActive({ kind: 'number', min: null, max: null })).toBe(false);
    expect(isColumnFilterActive({ kind: 'number', min: 1, max: null })).toBe(true);
    expect(isColumnFilterActive({ kind: 'date', min: null, max: null })).toBe(false);
    expect(isColumnFilterActive({ kind: 'date', min: '2026-01-01', max: null })).toBe(true);
    expect(isColumnFilterActive({ kind: 'select', optionIds: [] })).toBe(false);
    expect(isColumnFilterActive({ kind: 'select', optionIds: ['o1'] })).toBe(true);
    expect(isColumnFilterActive({ kind: 'checkbox', want: 'any' })).toBe(false);
    expect(isColumnFilterActive({ kind: 'checkbox', want: 'checked' })).toBe(true);
  });
});

describe('cellMatchesFilter', () => {
  it('an inactive filter passes everything (including empty cells)', () => {
    expect(cellMatchesFilter(null, { kind: 'text', query: '' })).toBe(true);
    expect(cellMatchesFilter('anything', defaultFilterFor('number'))).toBe(true);
  });

  it('text: case-insensitive contains, empty cell fails an active filter', () => {
    const f: ColumnFilter = { kind: 'text', query: 'Ap' };
    expect(cellMatchesFilter('Pineapple', f)).toBe(true);
    expect(cellMatchesFilter('banana', f)).toBe(false);
    expect(cellMatchesFilter(null, f)).toBe(false);
  });

  it('number: inclusive min/max range, non-numeric fails', () => {
    const f: ColumnFilter = { kind: 'number', min: 10, max: 20 };
    expect(cellMatchesFilter(10, f)).toBe(true);
    expect(cellMatchesFilter(20, f)).toBe(true);
    expect(cellMatchesFilter(9, f)).toBe(false);
    expect(cellMatchesFilter(21, f)).toBe(false);
    expect(cellMatchesFilter(null, f)).toBe(false);
    // min-only
    expect(cellMatchesFilter(100, { kind: 'number', min: 10, max: null })).toBe(true);
  });

  it('date: lexical == chronological on YYYY-MM-DD', () => {
    const f: ColumnFilter = { kind: 'date', min: '2026-01-01', max: '2026-06-30' };
    expect(cellMatchesFilter('2026-03-15', f)).toBe(true);
    expect(cellMatchesFilter('2025-12-31', f)).toBe(false);
    expect(cellMatchesFilter('2026-07-01', f)).toBe(false);
    expect(cellMatchesFilter(null, f)).toBe(false);
  });

  it('select: cell option id must be in the chosen set', () => {
    const f: ColumnFilter = { kind: 'select', optionIds: ['o1', 'o3'] };
    expect(cellMatchesFilter('o1', f)).toBe(true);
    expect(cellMatchesFilter('o2', f)).toBe(false);
    expect(cellMatchesFilter(null, f)).toBe(false);
  });

  it('checkbox: checked vs unchecked (null == unchecked)', () => {
    expect(cellMatchesFilter(true, { kind: 'checkbox', want: 'checked' })).toBe(true);
    expect(cellMatchesFilter(false, { kind: 'checkbox', want: 'checked' })).toBe(false);
    expect(cellMatchesFilter(false, { kind: 'checkbox', want: 'unchecked' })).toBe(true);
    expect(cellMatchesFilter(null, { kind: 'checkbox', want: 'unchecked' })).toBe(true);
    expect(cellMatchesFilter(true, { kind: 'checkbox', want: 'unchecked' })).toBe(false);
  });
});
