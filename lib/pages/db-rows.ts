import type {
  DatabaseColumn,
  DatabaseRow,
  DatabaseCellValue,
} from '@/components/pages/database-extension';

/**
 * Pure row transforms for the database block. Kept separate from the (large,
 * React-heavy) `database-block.tsx` so the mutation logic is unit-testable in
 * isolation — mirrors the `db-filter.ts` split. Each returns a new array
 * (immutable update) and never mutates the input.
 */

/** Set a single cell value on a row, returning a new rows array. */
export function setRowCell(
  rows: DatabaseRow[],
  rowId: string,
  colId: string,
  value: DatabaseCellValue
): DatabaseRow[] {
  return rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r));
}

/** Set a row's rich-text body (a Tiptap JSON doc), returning a new rows array. */
export function setRowBody(rows: DatabaseRow[], rowId: string, body: unknown): DatabaseRow[] {
  return rows.map((r) => (r.id === rowId ? { ...r, body } : r));
}

/**
 * The row's "primary" column — its title in the detail view. Matches the
 * table's bolded first cell (`isPrimary = cellIdx === 0`); returns null for an
 * empty column set. (Intentionally not the backlog's claude-aware heuristic.)
 */
export function primaryColumn(columns: DatabaseColumn[]): DatabaseColumn | null {
  return columns[0] ?? null;
}
