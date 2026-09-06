import type { DatabaseColumn, DatabaseRow } from '@/components/pages/database-extension';

/**
 * Pure, side-effect-free reorder / reclassify transforms for the database
 * block's stored `rows` array (the single source of truth for row order).
 * Mirrors the `db-rows.ts` / `db-view.ts` split so the drag-and-drop mutation
 * logic is unit-testable in isolation and reused verbatim by the Table and
 * Kanban views. Each helper returns a NEW array on change and the ORIGINAL
 * array (same reference) on a no-op, and never mutates its input.
 */

/**
 * arrayMove semantics (matches `@dnd-kit/sortable`): move the element at `from`
 * so it sits at index `to` (measured in the original array). Pure; new array.
 */
function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  const next = array.slice();
  next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]);
  return next;
}

/** The normalized group bucket a row belongs to: an option id, or null. */
function groupValueOf(row: DatabaseRow, groupColId: string): string | null {
  const v = row.cells[groupColId];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Whether a column is groupable (single-select only; multiselect never groups). */
function isSelectColumn(columns: DatabaseColumn[], colId: string | null): boolean {
  if (!colId) return false;
  const col = columns.find((c) => c.id === colId);
  return !!col && col.type === 'select';
}

/**
 * Move `activeId` to `overId`'s position (arrayMove semantics). No-op — returns
 * the original array — if either id is missing or they're equal.
 */
export function moveRow(rows: DatabaseRow[], activeId: string, overId: string): DatabaseRow[] {
  if (activeId === overId) return rows;
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  if (from === -1 || to === -1) return rows;
  return arrayMove(rows, from, to);
}

/**
 * Set the active row's group-select cell to `targetValue` (an option id, or
 * `null` for the "no value" bucket), returning a new array. No-op if the row is
 * missing, the column isn't a single-select, or the value is already set.
 */
export function reclassifyRow(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  activeId: string,
  groupColId: string | null,
  targetValue: string | null
): DatabaseRow[] {
  if (!isSelectColumn(columns, groupColId)) return rows;
  const colId = groupColId as string;
  const row = rows.find((r) => r.id === activeId);
  if (!row) return rows;
  if (groupValueOf(row, colId) === targetValue) return rows;
  return rows.map((r) =>
    r.id === activeId ? { ...r, cells: { ...r.cells, [colId]: targetValue } } : r
  );
}

/**
 * Cross-group drag: reclassify the active row into `targetValue`'s bucket AND
 * position it. When `overId` is a real row, the active row lands at that row's
 * position (arrayMove); when `overId` is null (dropped on empty column space),
 * the active row is appended after the last member of the target group (or the
 * end of the array when the group is otherwise empty). Pure; new array on any
 * change, original array on a full no-op.
 */
export function moveRowToGroup(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  activeId: string,
  groupColId: string | null,
  targetValue: string | null,
  overId: string | null
): DatabaseRow[] {
  const reclassified = reclassifyRow(rows, columns, activeId, groupColId, targetValue);

  // Dropped onto another card → land at that card's slot.
  if (overId && overId !== activeId) {
    return moveRow(reclassified, activeId, overId);
  }

  // Dropped on empty column space → append within the target group. Only
  // meaningful when we can resolve the group column; otherwise leave order be.
  if (!isSelectColumn(columns, groupColId)) return reclassified;
  const colId = groupColId as string;
  const from = reclassified.findIndex((r) => r.id === activeId);
  if (from === -1) return reclassified;

  const without = reclassified.slice();
  const [moved] = without.splice(from, 1);
  let insertAt = without.length;
  for (let i = without.length - 1; i >= 0; i--) {
    if (groupValueOf(without[i], colId) === targetValue) {
      insertAt = i + 1;
      break;
    }
  }
  // If nothing changed (already last in its group), keep the reclassified array.
  without.splice(insertAt, 0, moved);
  const unchanged =
    without.length === reclassified.length && without.every((r, i) => r === reclassified[i]);
  return unchanged ? reclassified : without;
}
