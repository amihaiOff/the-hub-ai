import type { DatabaseCellValue, DatabaseColumn } from './database-extension';

/**
 * Per-column filter model for the Areas database block. One variant per column
 * type. Kept pure + serializable so the matching logic is unit-testable and the
 * UI just edits plain objects. Filters are held in ephemeral view state (like
 * sorting) — never persisted to the document.
 */
export type ColumnFilter =
  | { kind: 'text'; query: string }
  | { kind: 'number'; min: number | null; max: number | null }
  | { kind: 'date'; min: string | null; max: string | null }
  | { kind: 'select'; optionIds: string[] }
  | { kind: 'checkbox'; want: 'checked' | 'unchecked' | 'any' };

/** A fresh, inactive filter for a column of the given type. */
export function defaultFilterFor(type: DatabaseColumn['type']): ColumnFilter {
  switch (type) {
    case 'text':
      return { kind: 'text', query: '' };
    case 'number':
      return { kind: 'number', min: null, max: null };
    case 'date':
      return { kind: 'date', min: null, max: null };
    case 'select':
      return { kind: 'select', optionIds: [] };
    case 'checkbox':
      return { kind: 'checkbox', want: 'any' };
  }
}

/** True when the filter actually constrains anything (else it's a no-op). */
export function isColumnFilterActive(f: ColumnFilter): boolean {
  switch (f.kind) {
    case 'text':
      return f.query.trim() !== '';
    case 'number':
      return f.min !== null || f.max !== null;
    case 'date':
      return !!f.min || !!f.max;
    case 'select':
      return f.optionIds.length > 0;
    case 'checkbox':
      return f.want !== 'any';
  }
}

/**
 * Does a cell value pass the filter? Called per row by TanStack's
 * getFilteredRowModel. An inactive filter passes everything; an active filter
 * against an empty/missing cell fails (empty cells are filtered out).
 */
export function cellMatchesFilter(value: DatabaseCellValue, f: ColumnFilter): boolean {
  if (!isColumnFilterActive(f)) return true;

  switch (f.kind) {
    case 'text':
      return String(value ?? '')
        .toLowerCase()
        .includes(f.query.trim().toLowerCase());

    case 'number': {
      if (value === null || value === '') return false;
      const n = Number(value);
      if (Number.isNaN(n)) return false;
      if (f.min !== null && n < f.min) return false;
      if (f.max !== null && n > f.max) return false;
      return true;
    }

    case 'date': {
      // Dates are stored as `YYYY-MM-DD` strings, so lexical compare == chronological.
      if (typeof value !== 'string' || value === '') return false;
      if (f.min && value < f.min) return false;
      if (f.max && value > f.max) return false;
      return true;
    }

    case 'select':
      // `value` is a select option id (or null when unset).
      return typeof value === 'string' && f.optionIds.includes(value);

    case 'checkbox':
      // Checkbox cells are booleans; treat null as unchecked.
      return f.want === 'checked' ? value === true : value !== true;
  }
}
