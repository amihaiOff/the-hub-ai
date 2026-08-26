import { coerceValue } from '../database-block';

/**
 * coerceValue runs whenever a column's TYPE changes, converting each existing
 * cell to the new type. The multiselect additions matter most: converting to/
 * from the array shape must never lose the "it's an array" invariant or throw.
 */
describe('coerceValue', () => {
  it('null → empty value per type ([] for multiselect, false for checkbox, else null)', () => {
    expect(coerceValue(null, 'multiselect')).toEqual([]);
    expect(coerceValue(null, 'checkbox')).toBe(false);
    expect(coerceValue(null, 'text')).toBeNull();
    expect(coerceValue(null, 'select')).toBeNull();
  });

  it('→ multiselect: wraps a scalar id, filters an array to strings, empties otherwise', () => {
    expect(coerceValue('o1', 'multiselect')).toEqual(['o1']);
    expect(coerceValue(['o1', 'o2'], 'multiselect')).toEqual(['o1', 'o2']);
    expect(coerceValue(42, 'multiselect')).toEqual([]);
  });

  it('multiselect → select keeps the first option id', () => {
    expect(coerceValue(['o2', 'o3'], 'select')).toBe('o2');
    expect(coerceValue([], 'select')).toBeNull();
  });

  it('multiselect → text joins ids, → checkbox reflects non-empty', () => {
    expect(coerceValue(['a', 'b'], 'text')).toBe('a, b');
    expect(coerceValue(['a'], 'checkbox')).toBe(true);
    expect(coerceValue([], 'checkbox')).toBe(false);
  });

  it('multiselect → number takes the first element (NaN → null)', () => {
    expect(coerceValue(['5', 'x'], 'number')).toBe(5);
    expect(coerceValue(['x'], 'number')).toBeNull();
  });

  it('→ multiselect drops non-string entries from a mixed array', () => {
    // Values only ever hold string ids, but coerceValue must be defensive so a
    // mixed array can never poison the [] invariant downstream.
    expect(coerceValue(['a', 42 as unknown as string, 'b'], 'multiselect')).toEqual(['a', 'b']);
  });

  it('multiselect → date yields null (an array is not a YYYY-MM-DD string)', () => {
    expect(coerceValue(['2026-01-01'], 'date')).toBeNull();
  });

  it('round-trips select → multiselect → select without losing the id', () => {
    const asMulti = coerceValue('o1', 'multiselect');
    expect(asMulti).toEqual(['o1']);
    expect(coerceValue(asMulti, 'select')).toBe('o1');
  });
});
