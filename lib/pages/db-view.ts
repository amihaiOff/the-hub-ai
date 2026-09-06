import type {
  DatabaseColumn,
  DatabaseRow,
  DatabaseCellValue,
} from '@/components/pages/database-extension';
import {
  type ColumnFilter,
  isColumnFilterActive,
  cellMatchesFilter,
} from '@/components/pages/db-filter';

/**
 * Pure view engine for the Areas database block (v2): the shared view config
 * shape and the transforms that turn stored `columns`/`rows` into what each
 * view renders — column visibility/width, filtering, sorting, and grouping.
 *
 * Kept side-effect-free and React-free so it's unit-testable in isolation and
 * reused verbatim by the Table, Cards, and Kanban views (mirrors the existing
 * `db-filter.ts` / `db-rows.ts` split). None of this touches the columns/rows
 * storage shape, so the agent backlog reader is unaffected.
 */

export type DbView = 'table' | 'cards' | 'kanban';
export type DbDensity = 'airy' | 'dense';

export interface DbSort {
  columnId: string;
  dir: 'asc' | 'desc';
}

/**
 * Shared, per-block view configuration, persisted as the node's `viewConfig`
 * attribute. Every field is optional in storage (legacy blocks have none);
 * `resolveViewConfig` fills defaults.
 */
export interface ViewConfig {
  view: DbView;
  density: DbDensity;
  /** Column id (a `select` column) to cluster rows by in Table/Cards. null = flat. */
  groupBy: string | null;
  /** Column id (a `select` column) the Kanban board's columns come from. */
  kanbanBy: string | null;
  sort: DbSort | null;
  /** Active filters keyed by column id. */
  filters: Record<string, ColumnFilter>;
  /** Hidden column ids, per view. The primary (first) column is never hidden. */
  hidden: Record<DbView, string[]>;
  /** Cards view: hide fields with no value (default true). */
  hideEmptyCardFields: boolean;
}

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  view: 'table',
  density: 'airy',
  groupBy: null,
  kanbanBy: null,
  sort: null,
  filters: {},
  hidden: { table: [], cards: [], kanban: [] },
  hideEmptyCardFields: true,
};

/** Per-type default column width (px) when a column has no stored `width`. */
const DEFAULT_WIDTH: Record<DatabaseColumn['type'], number> = {
  text: 220,
  number: 130,
  date: 140,
  select: 160,
  multiselect: 200,
  checkbox: 90,
};
/** The primary (title) column is wider by default. */
const PRIMARY_WIDTH = 280;
const MIN_WIDTH = 64;

/** Resolved width (px) for a column at a given index (index 0 = primary/title). */
export function columnWidth(col: DatabaseColumn, index: number): number {
  const w =
    typeof col.width === 'number'
      ? col.width
      : index === 0
        ? PRIMARY_WIDTH
        : DEFAULT_WIDTH[col.type];
  return Math.max(MIN_WIDTH, w);
}

/**
 * Merge a stored (possibly partial / legacy-null) view config with defaults.
 * Defensive against malformed JSON: unknown fields are ignored and each field
 * falls back to its default when absent or the wrong type.
 */
export function resolveViewConfig(raw: unknown): ViewConfig {
  const d = DEFAULT_VIEW_CONFIG;
  if (!raw || typeof raw !== 'object') return { ...d, hidden: { ...d.hidden }, filters: {} };
  const r = raw as Partial<ViewConfig> & Record<string, unknown>;
  const view: DbView = r.view === 'cards' || r.view === 'kanban' ? r.view : 'table';
  const density: DbDensity = r.density === 'dense' ? 'dense' : 'airy';
  const sort: DbSort | null =
    r.sort && typeof r.sort === 'object' && typeof (r.sort as DbSort).columnId === 'string'
      ? {
          columnId: (r.sort as DbSort).columnId,
          dir: (r.sort as DbSort).dir === 'desc' ? 'desc' : 'asc',
        }
      : null;
  const hiddenIn = (r.hidden ?? {}) as Partial<Record<DbView, unknown>>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    view,
    density,
    groupBy: typeof r.groupBy === 'string' ? r.groupBy : null,
    kanbanBy: typeof r.kanbanBy === 'string' ? r.kanbanBy : null,
    sort,
    filters:
      r.filters && typeof r.filters === 'object' ? (r.filters as Record<string, ColumnFilter>) : {},
    hidden: {
      table: arr(hiddenIn.table),
      cards: arr(hiddenIn.cards),
      kanban: arr(hiddenIn.kanban),
    },
    hideEmptyCardFields: r.hideEmptyCardFields !== false,
  };
}

/**
 * Columns visible in a given view, in stored order. The primary column (index
 * 0) is always shown; every other column can be hidden via `config.hidden`.
 */
export function visibleColumns(
  columns: DatabaseColumn[],
  config: ViewConfig,
  view: DbView
): DatabaseColumn[] {
  const hidden = new Set(config.hidden[view] ?? []);
  return columns.filter((c, i) => i === 0 || !hidden.has(c.id));
}

/** Rows passing all active filters (AND across columns). Pure; new array. */
export function applyFilters(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  filters: Record<string, ColumnFilter>
): DatabaseRow[] {
  const active = columns
    .map((c) => ({ col: c, f: filters[c.id] }))
    .filter(
      (x): x is { col: DatabaseColumn; f: ColumnFilter } => !!x.f && isColumnFilterActive(x.f)
    );
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(({ col, f }) => cellMatchesFilter(r.cells[col.id] ?? null, f))
  );
}

function isEmptyCell(v: DatabaseCellValue): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Type-aware comparison of two NON-empty cell values for a column. */
function compareCells(a: DatabaseCellValue, b: DatabaseCellValue, col: DatabaseColumn): number {
  switch (col.type) {
    case 'number':
      return Number(a) - Number(b);
    case 'checkbox':
      return (a ? 1 : 0) - (b ? 1 : 0);
    case 'date':
      return String(a).localeCompare(String(b)); // YYYY-MM-DD sorts lexically
    case 'select': {
      // Order by the option's position in the column's option list.
      const order = (id: DatabaseCellValue) => col.options?.findIndex((o) => o.id === id) ?? -1;
      return order(a) - order(b);
    }
    case 'multiselect': {
      const label = (v: DatabaseCellValue) =>
        Array.isArray(v)
          ? v.map((id) => col.options?.find((o) => o.id === id)?.label ?? '').join(', ')
          : '';
      return label(a).localeCompare(label(b));
    }
    default:
      return String(a).localeCompare(String(b));
  }
}

/** Rows sorted by the given sort spec (stable). Pure; new array. */
export function sortRows(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  sort: DbSort | null
): DatabaseRow[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.columnId);
  if (!col) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([ra, ia], [rb, ib]) => {
      const va = ra.cells[col.id] ?? null;
      const vb = rb.cells[col.id] ?? null;
      const ea = isEmptyCell(va);
      const eb = isEmptyCell(vb);
      // Empties always sort last, regardless of direction.
      if (ea && eb) return ia - ib;
      if (ea) return 1;
      if (eb) return -1;
      const c = compareCells(va, vb, col) * dir;
      return c !== 0 ? c : ia - ib; // stable tiebreak on original index
    })
    .map(([r]) => r);
}

export interface RowGroup {
  /** Option id, or `NO_GROUP` for the "no value" bucket. */
  key: string;
  label: string;
  /** Select-option color key, or null for the no-value bucket. */
  color: string | null;
  rows: DatabaseRow[];
}

export const NO_GROUP = '__none__';

/**
 * Group rows by a `select` column, in the column's option order, with a
 * trailing "No {column}" bucket for rows with no value.
 *
 * - `includeEmpty` (Kanban) keeps option groups that have no rows so they still
 *   render as drop targets; otherwise (Table/Cards) empty option groups are
 *   dropped. The no-value bucket appears only when it actually has rows.
 * - Returns a single implicit group when the column is missing or not a select.
 */
export function groupRows(
  rows: DatabaseRow[],
  columns: DatabaseColumn[],
  groupColId: string | null,
  opts: { includeEmpty?: boolean } = {}
): RowGroup[] {
  const col = groupColId ? columns.find((c) => c.id === groupColId) : null;
  if (!col || col.type !== 'select' || !col.options) {
    return [{ key: NO_GROUP, label: '', color: null, rows }];
  }
  const byOpt = new Map<string, DatabaseRow[]>();
  col.options.forEach((o) => byOpt.set(o.id, []));
  const none: DatabaseRow[] = [];
  for (const r of rows) {
    const v = r.cells[col.id];
    if (typeof v === 'string' && byOpt.has(v)) byOpt.get(v)!.push(r);
    else none.push(r);
  }
  const groups: RowGroup[] = [];
  for (const o of col.options) {
    const rs = byOpt.get(o.id)!;
    if (rs.length > 0 || opts.includeEmpty) {
      groups.push({ key: o.id, label: o.label, color: o.color ?? null, rows: rs });
    }
  }
  if (none.length > 0) {
    groups.push({ key: NO_GROUP, label: `No ${col.name}`, color: null, rows: none });
  }
  return groups;
}

/** Columns eligible to group / build a Kanban board from (single-select only). */
export function groupableColumns(columns: DatabaseColumn[]): DatabaseColumn[] {
  return columns.filter((c) => c.type === 'select');
}
