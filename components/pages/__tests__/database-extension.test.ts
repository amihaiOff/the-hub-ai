import {
  emptyCellValue,
  makeColumn,
  makeRow,
  type DatabaseColumnType,
} from '../database-extension';

/**
 * Pure structural helpers that seed columns / rows / empty cells. The
 * multiselect additions matter most: the "empty value is [] (never null)" and
 * "multiselect columns carry an options array" invariants are what the cell
 * renderer + filter code rely on, so pin them here.
 */
describe('emptyCellValue', () => {
  it('returns [] for multiselect, false for checkbox, null for the rest', () => {
    expect(emptyCellValue('multiselect')).toEqual([]);
    expect(emptyCellValue('checkbox')).toBe(false);
    expect(emptyCellValue('text')).toBeNull();
    expect(emptyCellValue('number')).toBeNull();
    expect(emptyCellValue('date')).toBeNull();
    expect(emptyCellValue('select')).toBeNull();
  });

  it('hands back a fresh array each call (no shared mutable default)', () => {
    const a = emptyCellValue('multiselect');
    const b = emptyCellValue('multiselect');
    expect(a).not.toBe(b);
  });
});

describe('makeColumn', () => {
  it('seeds an empty options array only for select + multiselect', () => {
    expect(makeColumn('Tags', 'multiselect').options).toEqual([]);
    expect(makeColumn('Status', 'select').options).toEqual([]);
    for (const type of ['text', 'number', 'date', 'checkbox'] as const) {
      expect(makeColumn('x', type).options).toBeUndefined();
    }
  });
});

describe('makeRow', () => {
  it('seeds each cell with its type-appropriate empty value', () => {
    const types: DatabaseColumnType[] = [
      'text',
      'number',
      'date',
      'select',
      'multiselect',
      'checkbox',
    ];
    const cols = types.map((t) => makeColumn(t, t));
    const row = makeRow(cols);
    for (const col of cols) {
      expect(row.cells[col.id]).toEqual(emptyCellValue(col.type));
    }
    // Spot-check the multiselect invariant explicitly.
    const msCol = cols.find((c) => c.type === 'multiselect')!;
    expect(row.cells[msCol.id]).toEqual([]);
  });
});
