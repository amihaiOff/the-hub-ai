import type { DatabaseColumn, DatabaseRow, DatabaseCellValue } from '@/lib/pages/db-schema';
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
  /**
   * Column id (a `select` column) to cluster rows by, PER VIEW. null = flat.
   *
   * `groupBy`, `sort` and `filters` are keyed by view (like `hidden` always
   * was) so the three views are independent workspaces: filtering the Kanban
   * board doesn't hide rows in the Table. Settings that only ever applied to
   * one view — `density` (table), `kanbanBy` (kanban), `hideEmptyCardFields`
   * (cards) — stay flat, since there's nothing to separate.
   */
  groupBy: Record<DbView, string | null>;
  /** Column id (a `select` column) the Kanban board's columns come from. */
  kanbanBy: string | null;
  /** Active sort, per view. */
  sort: Record<DbView, DbSort | null>;
  /** Active filters keyed by column id, per view. */
  filters: Record<DbView, Record<string, ColumnFilter>>;
  /** Hidden column ids, per view. The primary (first) column is never hidden. */
  hidden: Record<DbView, string[]>;
  /** Cards view: hide fields with no value (default true). */
  hideEmptyCardFields: boolean;
}

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  view: 'table',
  density: 'airy',
  groupBy: { table: null, cards: null, kanban: null },
  kanbanBy: null,
  sort: { table: null, cards: null, kanban: null },
  filters: { table: {}, cards: {}, kanban: {} },
  hidden: { table: [], cards: [], kanban: [] },
  hideEmptyCardFields: true,
};

/** The three views, for building and walking per-view records. */
export const VIEW_KEYS = ['table', 'cards', 'kanban'] as const satisfies readonly DbView[];

/**
 * Remove one column's filter from every view.
 *
 * Used when a column is deleted or its type changes: the filter is invalid
 * everywhere, not only in whichever view happened to be open.
 */
export function withoutColumnFilter(
  filters: Record<DbView, Record<string, ColumnFilter>>,
  colId: string
): Record<DbView, Record<string, ColumnFilter>> {
  const next = {} as Record<DbView, Record<string, ColumnFilter>>;
  for (const v of VIEW_KEYS) {
    const rest = { ...filters[v] };
    delete rest[colId];
    next[v] = rest;
  }
  return next;
}

/**
 * Build a per-view record, accepting either the new per-view shape or a legacy
 * flat value.
 *
 * Legacy blocks stored one shared `sort`/`filters`/`groupBy`. Those are lifted
 * into ALL views so a block looks exactly as it did before the split — the
 * views only diverge once the user changes one. Resetting instead would
 * silently drop filters people are relying on.
 *
 * `parse` runs once PER VIEW (never once with the result shared) so the three
 * views can't end up aliasing one mutable object, and so `parse(undefined)`
 * supplies each view's own empty value when nothing is stored.
 *
 * `isLeaf` disambiguates the one shape that is genuinely ambiguous: legacy
 * `filters` is keyed by COLUMN id, so a column whose id is literally `table` /
 * `cards` / `kanban` would otherwise be misread as the new per-view shape and
 * the block's filters silently dropped. A legacy leaf is recognisable (a
 * `ColumnFilter` has a `kind` discriminant) and sends us down the legacy path.
 */
function perView<T>(
  raw: unknown,
  parse: (v: unknown) => T,
  isLeaf?: (v: unknown) => boolean
): Record<DbView, T> {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const isPerView = !!obj && VIEW_KEYS.some((v) => v in obj && !isLeaf?.(obj[v]));
  if (isPerView) {
    const r = obj as Partial<Record<DbView, unknown>>;
    return { table: parse(r.table), cards: parse(r.cards), kanban: parse(r.kanban) };
  }
  return { table: parse(raw), cards: parse(raw), kanban: parse(raw) };
}

/** A `ColumnFilter` (legacy flat leaf) rather than a per-view filter bucket. */
function isColumnFilterLeaf(v: unknown): boolean {
  return !!v && typeof v === 'object' && typeof (v as { kind?: unknown }).kind === 'string';
}

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

/** Type guard for a valid `DbView` string. */
export function isView(v: unknown): v is DbView {
  return v === 'table' || v === 'cards' || v === 'kanban';
}

/**
 * Merge a stored (possibly partial / legacy-null) view config with defaults.
 * Defensive against malformed JSON: unknown fields are ignored and each field
 * falls back to its default when absent or the wrong type.
 *
 * `defaultView` is the view used only when none is persisted (brand-new or
 * never-switched blocks). Callers pass a device-appropriate default (Cards on
 * mobile, Table on desktop); once anyone switches view it persists and wins.
 * Defaults to `'table'` so existing callers/tests behave identically.
 */
export function resolveViewConfig(raw: unknown, defaultView: DbView = 'table'): ViewConfig {
  const d = DEFAULT_VIEW_CONFIG;
  if (!raw || typeof raw !== 'object')
    return {
      ...d,
      view: defaultView,
      hidden: { ...d.hidden },
      sort: { ...d.sort },
      filters: { table: {}, cards: {}, kanban: {} },
      groupBy: { ...d.groupBy },
    };
  const r = raw as Partial<ViewConfig> & Record<string, unknown>;
  const view: DbView = isView(r.view) ? r.view : defaultView;
  const density: DbDensity = r.density === 'dense' ? 'dense' : 'airy';
  const parseSort = (v: unknown): DbSort | null =>
    v && typeof v === 'object' && typeof (v as DbSort).columnId === 'string'
      ? { columnId: (v as DbSort).columnId, dir: (v as DbSort).dir === 'desc' ? 'desc' : 'asc' }
      : null;
  // Cloned, not passed through: each view must own its filter map so lifting a
  // legacy value into all three can't leave them aliasing one object.
  const parseFilters = (v: unknown): Record<string, ColumnFilter> =>
    v && typeof v === 'object' ? { ...(v as Record<string, ColumnFilter>) } : {};
  const parseGroupBy = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const hiddenIn = (r.hidden ?? {}) as Partial<Record<DbView, unknown>>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    view,
    density,
    groupBy: perView(r.groupBy, parseGroupBy),
    kanbanBy: typeof r.kanbanBy === 'string' ? r.kanbanBy : null,
    sort: perView(r.sort, parseSort),
    filters: perView(r.filters, parseFilters, isColumnFilterLeaf),
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
