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
 * Whether a row's body doc holds real content (used to keep the open icon
 * always visible when there's a page to see). Treats an empty doc or a doc that
 * is only empty paragraph(s) as no content.
 */
export function hasBodyContent(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const content = (body as { content?: unknown[] }).content;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.some((node) => {
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== 'paragraph') return true; // any non-paragraph block = content
    return Array.isArray(n.content) && n.content.length > 0; // non-empty paragraph
  });
}

/**
 * The row's "primary" column — its title in the detail view. Matches the
 * table's bolded first cell (`isPrimary = cellIdx === 0`); returns null for an
 * empty column set. (Intentionally not the backlog's claude-aware heuristic.)
 */
export function primaryColumn(columns: DatabaseColumn[]): DatabaseColumn | null {
  return columns[0] ?? null;
}
