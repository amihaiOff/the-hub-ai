/**
 * The shape of an Areas database block's data — column definitions, rows and
 * cell values — plus the pure constructors for them.
 *
 * This module is deliberately free of React and Tiptap so it can be imported
 * from server code (API routes) as well as the editor. The editor-side module
 * (`components/pages/database-extension.ts`) re-exports everything here, so
 * client callers can keep importing from either place.
 */

export type DatabaseColumnType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox';

export interface DatabaseColumn {
  /** Stable per-column id. Persisted so referencing the column by name isn't required. */
  id: string;
  name: string;
  type: DatabaseColumnType;
  /** Present for `select` and `multiselect` columns. Each option carries a stable id + label + optional color key. */
  options?: { id: string; label: string; color?: string }[];
  /**
   * Persisted column width in px (Table view), set by dragging the header
   * border. Optional — a missing width falls back to a per-type default
   * (see `columnWidth` in `db-view.ts`).
   */
  width?: number;
}

/**
 * A cell value. `string[]` is the `multiselect` shape — an array of the
 * selected options' ids (empty array = nothing selected). Every other column
 * type stores a scalar.
 */
export type DatabaseCellValue = string | number | boolean | string[] | null;

export interface DatabaseRow {
  id: string;
  /** Cells keyed by column id. Missing keys render as empty. */
  cells: Record<string, DatabaseCellValue>;
  /**
   * Optional rich-text body for the row's detail view (a Tiptap JSON doc),
   * edited in the entry side panel. `undefined` on legacy rows → empty body.
   */
  body?: unknown;
}

export function newId(prefix: string): string {
  // Simple non-cryptographic id — enough for local disambiguation.
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeColumn(name: string, type: DatabaseColumnType): DatabaseColumn {
  const col: DatabaseColumn = { id: newId('col'), name, type };
  if (type === 'select' || type === 'multiselect') col.options = [];
  return col;
}

/** Empty (unset) value for a column of the given type. */
export function emptyCellValue(type: DatabaseColumnType): DatabaseCellValue {
  if (type === 'checkbox') return false;
  if (type === 'multiselect') return [];
  return null;
}

export function makeRow(cols: DatabaseColumn[]): DatabaseRow {
  return {
    id: newId('row'),
    cells: Object.fromEntries(cols.map((c) => [c.id, emptyCellValue(c.type)])),
  };
}

export function makeSelectOption(label: string, color?: string) {
  return { id: newId('opt'), label, color };
}
