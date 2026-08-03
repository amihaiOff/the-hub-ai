'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Baseline,
  Calendar,
  Check,
  ChevronDown,
  Filter,
  Hash,
  ListChecks,
  Plus,
  Redo2,
  SquareCheckBig,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';
import { floatingControlBottom } from './undo-redo-bar';
import { cn } from '@/lib/utils';
import {
  cellMatchesFilter,
  isColumnFilterActive,
  seedValueForFilter,
  type ColumnFilter,
} from './db-filter';
import { DatabaseFilterPanel } from './database-filter-panel';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  makeColumn,
  makeRow,
  makeSelectOption,
  newId,
  type DatabaseCellValue,
  type DatabaseColumn,
  type DatabaseColumnType,
  type DatabaseRow,
} from './database-extension';

/**
 * Read/write a block's persisted column filters. Filters are per-viewer view
 * state (never written to the shared document), but the user wants them to
 * survive a page reload, so they live in localStorage keyed by the block id.
 */
const FILTER_STORAGE_PREFIX = 'hubai:db-filters:';

function loadPersistedFilters(blockId: string | null): Record<string, ColumnFilter> {
  if (!blockId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_PREFIX + blockId);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ColumnFilter>) : {};
  } catch {
    return {};
  }
}

function persistFilters(blockId: string | null, filters: Record<string, ColumnFilter>) {
  if (!blockId || typeof window === 'undefined') return;
  try {
    const key = FILTER_STORAGE_PREFIX + blockId;
    // Only keep filters that actually constrain something, so cleared filters
    // don't linger in storage and the key is removed once nothing is active.
    const active = Object.fromEntries(
      Object.entries(filters).filter(([, f]) => isColumnFilterActive(f))
    );
    if (Object.keys(active).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(active));
  } catch {
    // Storage unavailable (private mode / quota) — persistence is best-effort.
  }
}

const TYPE_META: Record<
  DatabaseColumnType,
  { label: string; icon: typeof Baseline; color: string }
> = {
  text: { label: 'Text', icon: Baseline, color: 'text-slate-400' },
  number: { label: 'Number', icon: Hash, color: 'text-blue-400' },
  date: { label: 'Date', icon: Calendar, color: 'text-emerald-400' },
  select: { label: 'Select', icon: ListChecks, color: 'text-violet-400' },
  checkbox: { label: 'Checkbox', icon: SquareCheckBig, color: 'text-amber-400' },
};

/**
 * Palette for `select` option pills. Keys are persisted on the option's
 * `color` field so the swatch survives reload. Anything unknown falls
 * back to `slate` at render time — see `getSelectColor`.
 */
export const SELECT_COLORS = [
  {
    key: 'slate',
    pill: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
    swatch: 'bg-slate-400',
  },
  { key: 'blue', pill: 'bg-blue-500/20 text-blue-200 ring-blue-400/30', swatch: 'bg-blue-400' },
  {
    key: 'emerald',
    pill: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/30',
    swatch: 'bg-emerald-400',
  },
  {
    key: 'amber',
    pill: 'bg-amber-500/20 text-amber-200 ring-amber-400/30',
    swatch: 'bg-amber-400',
  },
  { key: 'rose', pill: 'bg-rose-500/20 text-rose-200 ring-rose-400/30', swatch: 'bg-rose-400' },
  {
    key: 'violet',
    pill: 'bg-violet-500/20 text-violet-200 ring-violet-400/30',
    swatch: 'bg-violet-400',
  },
  { key: 'pink', pill: 'bg-pink-500/20 text-pink-200 ring-pink-400/30', swatch: 'bg-pink-400' },
  {
    key: 'orange',
    pill: 'bg-orange-500/20 text-orange-200 ring-orange-400/30',
    swatch: 'bg-orange-400',
  },
] as const;

function getSelectColor(key: string | undefined) {
  return SELECT_COLORS.find((c) => c.key === key) ?? SELECT_COLORS[0];
}

/**
 * Best-effort color for an option that pre-dates the `color` field. We
 * cycle through the palette by index so a legacy 3-option column
 * (Todo/Doing/Done) reads as three distinct colors instead of three
 * grey pills.
 */
function resolveOptionColor(
  opt: { color?: string } | undefined,
  index: number
): (typeof SELECT_COLORS)[number] {
  if (opt?.color) return getSelectColor(opt.color);
  return SELECT_COLORS[index % SELECT_COLORS.length];
}

/**
 * NodeView for the Notion-like "database" block. Renders a TanStack Table
 * with click-header sorting, per-column type controls, per-cell editors, an
 * in-header add-column cell (+), an in-table add-row row (+), and a
 * hover-only delete-row gutter. Persists edits by writing new `columns` /
 * `rows` attributes back to the ProseMirror node.
 */
export function DatabaseBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const columns = (node.attrs.columns ?? []) as DatabaseColumn[];
  const rows = (node.attrs.rows ?? []) as DatabaseRow[];

  const editable = editor.isEditable;

  const setColumns = (next: DatabaseColumn[]) => updateAttributes({ columns: next });
  const setRows = (next: DatabaseRow[]) => updateAttributes({ rows: next });

  // Stable block id — used to key persisted view state (filters). Older blocks
  // predate the id attribute; backfill one on first mount so persistence has a
  // stable key. `null` until the backfill effect runs.
  const blockId = (node.attrs.id ?? null) as string | null;
  useEffect(() => {
    // Backfill a stable id on legacy blocks — but only when the doc is
    // editable, since this writes an attribute (a read-only viewer must never
    // mutate the document). Runs at most once per block.
    if (!blockId && editable) updateAttributes({ id: newId('dbb') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sorting, setSorting] = useState<SortingState>([]);
  // Per-column filters — per-viewer view state (like sorting), not written to
  // the shared doc, but persisted to localStorage (keyed by blockId) so they
  // survive reloads. Seeded from storage on first render.
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>(() =>
    loadPersistedFilters(blockId)
  );
  // Once the id backfill lands, hydrate filters for the now-known key (the
  // initial render had blockId === null for legacy blocks).
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (blockId && hydratedFor.current !== blockId) {
      hydratedFor.current = blockId;
      const stored = loadPersistedFilters(blockId);
      if (Object.keys(stored).length) setFilters(stored);
    }
  }, [blockId]);
  // Mirror filter changes into storage.
  useEffect(() => {
    persistFilters(blockId, filters);
  }, [blockId, filters]);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  // Column pending deletion — drives the confirmation dialog. Deletion is
  // destructive (drops the column and every cell under it), so all delete
  // entry points route through here instead of removing immediately.
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<{ id: string; name: string } | null>(
    null
  );

  const columnHelper = useMemo(() => createColumnHelper<DatabaseRow>(), []);
  const tableColumns = useMemo(
    () =>
      columns.map((col) =>
        columnHelper.accessor((row) => row.cells[col.id], {
          id: col.id,
          header: () => col.name,
          sortingFn: (a, b, id) => sortByType(col, a.original.cells[id], b.original.cells[id]),
          filterFn: (row, id, value) =>
            cellMatchesFilter(row.original.cells[id], value as ColumnFilter),
        })
      ),
    [columns, columnHelper]
  );

  // Only feed TanStack the ACTIVE filters, and only for columns that still
  // exist (a filter left behind by a deleted column, or one emptied back to a
  // no-op, is dropped from the row model and the chip count).
  const columnFilters: ColumnFiltersState = useMemo(
    () =>
      columns
        .filter((c) => filters[c.id] && isColumnFilterActive(filters[c.id]))
        .map((c) => ({ id: c.id, value: filters[c.id] })),
    [columns, filters]
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const setColumnFilter = (colId: string, next: ColumnFilter) =>
    setFilters((cur) => ({ ...cur, [colId]: next }));
  const clearColumnFilter = (colId: string) =>
    setFilters((cur) => {
      const n = { ...cur };
      delete n[colId];
      return n;
    });
  const clearAllFilters = () => setFilters({});
  const activeFilterColumns = columns.filter((c) => columnFilters.some((f) => f.id === c.id));

  const updateCell = useCallback(
    (rowId: string, colId: string, value: DatabaseCellValue) => {
      setRows(
        rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r))
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  );

  // After add-row / add-column we want to (a) scroll the new cell into
  // view and (b) drop the user into edit mode on it. Track the intent
  // and honor it in a post-render effect once the DOM contains the new
  // row/column.
  const [focusIntent, setFocusIntent] = useState<{ kind: 'row' | 'column'; id: string } | null>(
    null
  );

  const addRow = () => {
    const row = makeRow(columns);
    // Deliberate UX choice: clear any active sort so the appended row is
    // guaranteed to appear at the visual bottom. A sort would otherwise place
    // the new empty row wherever its blank value falls (e.g. at the top under
    // a descending sort). The user can re-sort by clicking a header again.
    if (sorting.length) setSorting([]);
    // Keep active filters (they persist across reloads and shouldn't be wiped by
    // adding a row). A blank row would be hidden by any active filter, so seed
    // the new row's cells to satisfy each active filter — the row then stays
    // visible and the scroll-into-view + focus below works.
    for (const col of columns) {
      const f = filters[col.id];
      if (f && isColumnFilterActive(f)) {
        const seed = seedValueForFilter(f);
        if (seed !== undefined) row.cells[col.id] = seed;
      }
    }
    setRows([...rows, row]);
    setFocusIntent({ kind: 'row', id: row.id });
  };
  const deleteRow = (rowId: string) => setRows(rows.filter((r) => r.id !== rowId));

  const addColumn = () => {
    const col = makeColumn('New column', 'text');
    setColumns([...columns, col]);
    setRows(rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: null } })));
    setFocusIntent({ kind: 'column', id: col.id });
  };

  useEffect(() => {
    if (!focusIntent) return;
    // Wait one frame so the added row/column has rendered.
    const raf = requestAnimationFrame(() => {
      if (focusIntent.kind === 'row') {
        const tr = document.querySelector<HTMLTableRowElement>(`[data-row-id="${focusIntent.id}"]`);
        // First text-ish field in the row — typically the Name cell. Text
        // cells render as a <textarea> (so long values wrap), so match that
        // first, then fall back to other inputs.
        const input = tr?.querySelector<HTMLTextAreaElement | HTMLInputElement>(
          'textarea, input:not([type="checkbox"]):not([type="date"]):not([type="number"]), input'
        );
        tr?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        input?.focus();
        input?.select?.();
      } else {
        const th = document.querySelector<HTMLElement>(`[data-col-header-id="${focusIntent.id}"]`);
        th?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        // ColumnHeader picks up autoStartEdit via prop (see JSX below).
      }
      setFocusIntent(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusIntent]);
  const performDeleteColumn = (colId: string) => {
    setColumns(columns.filter((c) => c.id !== colId));
    setRows(
      rows.map((r) => {
        const { [colId]: _dropped, ...rest } = r.cells;
        return { ...r, cells: rest };
      })
    );
    clearColumnFilter(colId);
  };
  // Ask before deleting — all delete entry points (quick-X, column menu,
  // mobile sheet) call this, which opens the confirmation dialog.
  const requestDeleteColumn = (colId: string) => {
    const col = columns.find((c) => c.id === colId);
    setConfirmDeleteCol({ id: colId, name: col?.name ?? 'this column' });
  };
  const renameColumn = (colId: string, name: string) => {
    setColumns(columns.map((c) => (c.id === colId ? { ...c, name } : c)));
  };
  const changeColumnType = (colId: string, type: DatabaseColumnType) => {
    setColumns(
      columns.map((c) => {
        if (c.id !== colId) return c;
        const next: DatabaseColumn = { ...c, type };
        if (type === 'select' && !next.options) next.options = [];
        if (type !== 'select') delete next.options;
        return next;
      })
    );
    setRows(
      rows.map((r) => {
        const raw = r.cells[colId];
        return { ...r, cells: { ...r.cells, [colId]: coerceValue(raw, type) } };
      })
    );
    // The existing filter is typed to the OLD column kind; drop it so it can't
    // run the wrong predicate against coerced values (which would silently blank
    // the grid) or render a mismatched control in the panel.
    clearColumnFilter(colId);
  };
  const setSelectOptions = (
    colId: string,
    options: { id: string; label: string; color?: string }[]
  ) => {
    setColumns(columns.map((c) => (c.id === colId ? { ...c, options } : c)));
  };

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  // Track whether a cell field is being edited. Focusing a cell's <textarea>/
  // <input> blurs the ProseMirror editor, so the page's own mobile toolbar
  // hides — leaving the user with no controls (and no easy way to dismiss the
  // keyboard). We surface a minimal cell toolbar (undo / redo / done) instead.
  const [cellEditing, setCellEditing] = useState(false);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !editable) return;
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      !!t.closest('td') &&
      (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) setCellEditing(true);
    };
    const onOut = (e: FocusEvent) => {
      // Keep the bar up while focus hops between cell fields; close when it
      // leaves the table entirely (relatedTarget is the element gaining focus).
      if (!isField(e.relatedTarget)) setCellEditing(false);
    };
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, [editable]);

  // A narrow trailing "add column" cell (2.5rem) lives in the header when
  // editable; include its width so table-layout: fixed leaves room for it.
  const addColWidthRem = editable ? 2.5 : 0;
  const tableWidthRem = columns.length * 10 + addColWidthRem;

  return (
    <NodeViewWrapper as="div" className="database-block group/db relative my-4 pl-9">
      {/* Filter toolbar — per-column filters held in ephemeral view state. */}
      {columns.length > 0 && (
        <div className="relative mb-1.5 flex flex-wrap items-center gap-1.5">
          <button
            ref={filterBtnRef}
            type="button"
            onClick={() => setFilterPanelOpen((o) => !o)}
            aria-label="Filter rows"
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
              activeFilterColumns.length > 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter{activeFilterColumns.length > 0 ? ` (${activeFilterColumns.length})` : ''}
          </button>
          {activeFilterColumns.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => clearColumnFilter(col.id)}
              title={`Clear filter on ${col.name}`}
              className="border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              <span className="max-w-[8rem] truncate">{col.name}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {filterPanelOpen && (
            <DatabaseFilterPanel
              columns={columns}
              filters={filters}
              anchorEl={filterBtnRef.current}
              onChange={setColumnFilter}
              onClearAll={clearAllFilters}
              onClose={() => setFilterPanelOpen(false)}
            />
          )}
        </div>
      )}
      <div ref={wrapperRef} className="relative overflow-x-auto">
        {/* Table width = column count × 10rem (+ the narrow add-column cell)
            so table-layout: fixed cells keep their intrinsic size. On narrow
            viewports the table exceeds the wrapper and `overflow-x-auto` gives
            a real horizontal scroll — `w-full` would collapse cells instead. */}
        <table
          className="min-w-full text-sm"
          style={{ tableLayout: 'fixed', width: `${tableWidthRem}rem` }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/40">
                {headerGroup.headers.map((header) => {
                  const col = columns.find((c) => c.id === header.column.id);
                  if (!col) return null;
                  const sort = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      data-col-header-id={col.id}
                      className="p-0"
                      style={{ width: '10rem' }}
                    >
                      <ColumnHeader
                        column={col}
                        sort={sort}
                        editable={editable}
                        autoStartEdit={focusIntent?.kind === 'column' && focusIntent.id === col.id}
                        onToggleSort={() => header.column.toggleSorting()}
                        onRename={(name) => renameColumn(col.id, name)}
                        onChangeType={(type) => changeColumnType(col.id, type)}
                        onDelete={() => requestDeleteColumn(col.id)}
                        onSetOptions={(opts) => setSelectOptions(col.id, opts)}
                      />
                    </th>
                  );
                })}
                {/* Narrow add-column cell — a plus in the header spawns a
                    new column (replaces the old floating edge tab). */}
                {editable && (
                  <th
                    data-add-column-cell=""
                    className="p-0 align-middle"
                    style={{ width: '2.5rem' }}
                  >
                    <button
                      type="button"
                      onClick={addColumn}
                      aria-label="Add column"
                      title="Add column"
                      className="text-muted-foreground/60 hover:text-primary hover:bg-primary/10 flex h-full w-full items-center justify-center py-2 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody ref={tbodyRef}>
            {table.getRowModel().rows.map((tableRow) => {
              const row = tableRow.original;
              return (
                <tr key={row.id} className="group/row" data-row-id={row.id}>
                  {tableRow.getVisibleCells().map((cell, cellIdx) => {
                    const col = columns.find((c) => c.id === cell.column.id);
                    if (!col) return null;
                    // First column reads as the row's primary label — bold it
                    // (Notion-style) so scanning a long table is easy.
                    const isPrimary = cellIdx === 0;
                    return (
                      <td key={cell.id} className="p-0 align-top">
                        <CellEditor
                          column={col}
                          value={row.cells[col.id]}
                          onChange={(v) => updateCell(row.id, col.id, v)}
                          editable={editable}
                          isPrimary={isPrimary}
                        />
                      </td>
                    );
                  })}
                  {/* Filler cell under the add-column header so row dividers
                      run the full table width. */}
                  {editable && <td data-add-column-cell="" className="p-0" />}
                </tr>
              );
            })}
            {rows.length === 0 && !editable && (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="text-muted-foreground py-4 text-center text-xs"
                >
                  Empty
                </td>
              </tr>
            )}
            {activeFilterColumns.length > 0 &&
              rows.length > 0 &&
              table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={(columns.length || 1) + (editable ? 1 : 0)}
                    className="text-muted-foreground py-4 text-center text-xs"
                  >
                    No rows match the filter.
                  </td>
                </tr>
              )}
            {/* "+ New row" footer — a left-aligned text button spans the
                full table width, matching the Notion inline-database style. */}
            {editable && (
              <tr data-add-row="">
                <td colSpan={columns.length + 1} className="p-0">
                  <button
                    type="button"
                    onClick={addRow}
                    aria-label="Add row"
                    title="Add row"
                    className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/30 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors"
                  >
                    <Plus className="h-4 w-4" /> New row
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editable && <DeleteRowGutter tbodyRef={tbodyRef} rows={rows} onDelete={deleteRow} />}

      {editable && cellEditing && <CellEditToolbar editor={editor} />}

      <Dialog
        open={confirmDeleteCol !== null}
        onOpenChange={(open) => !open && setConfirmDeleteCol(null)}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete this column?</DialogTitle>
            <DialogDescription>
              This removes the “{confirmDeleteCol?.name}” column and its values from every row. This
              can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteCol(null)}
              className="hover:bg-muted/60 rounded-lg px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDeleteCol) performDeleteColumn(confirmDeleteCol.id);
                setConfirmDeleteCol(null);
              }}
              className="bg-destructive hover:bg-destructive/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            >
              <Trash2 className="h-4 w-4" /> Delete column
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}

// ─── Delete-row gutter (outside the table, hover-only) ─────────────────

/**
 * A column of delete-row buttons sitting to the LEFT of the table, in the
 * padding of the NodeViewWrapper. Each button is absolute-positioned to
 * match its row's vertical center; we resync on any tbody / row size
 * change so alignment stays true through row adds/deletes and text edits.
 */
function DeleteRowGutter({
  tbodyRef,
  rows,
  onDelete,
}: {
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  rows: DatabaseRow[];
  onDelete: (rowId: string) => void;
}) {
  const [positions, setPositions] = useState<{ id: string; top: number; height: number }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Deferred-clear timer: mouse leaves the row → wait a beat before hiding
  // so the pointer's transit through the padding gap to the button doesn't
  // strand it in a "hidden" state and cancel the click. Any mouseenter on
  // the button clears the timer.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => setHoveredId(null), 200);
  }, [cancelHide]);

  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;
    const onOver = (e: MouseEvent) => {
      const tr = (e.target as Element | null)?.closest('tr[data-row-id]');
      const id = tr?.getAttribute('data-row-id') ?? null;
      if (id) {
        cancelHide();
        setHoveredId(id);
      }
    };
    const onLeave = () => scheduleHide();
    tbody.addEventListener('mouseover', onOver);
    tbody.addEventListener('mouseleave', onLeave);
    return () => {
      tbody.removeEventListener('mouseover', onOver);
      tbody.removeEventListener('mouseleave', onLeave);
      cancelHide();
    };
  }, [tbodyRef, cancelHide, scheduleHide]);

  useLayoutEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;
    const measure = () => {
      const tbodyTop = tbody.getBoundingClientRect().top;
      // The gutter is positioned relative to the NodeViewWrapper, which
      // wraps the whole block including my-4 margin. To place a button
      // at row Y we need the row's top relative to the wrapper — but
      // since the gutter itself is a sibling of the scroll-wrap
      // (both inside the wrapper) and inherits the wrapper's coord
      // system, we can compute from the wrapper's own top.
      const wrapper = tbody.closest('.database-block') as HTMLElement | null;
      const wrapperTop = wrapper?.getBoundingClientRect().top ?? tbodyTop;
      const next: { id: string; top: number; height: number }[] = [];
      for (const tr of Array.from(tbody.children)) {
        if (!(tr instanceof HTMLElement)) continue;
        const id = tr.getAttribute('data-row-id');
        if (!id) continue;
        const rect = tr.getBoundingClientRect();
        next.push({ id, top: rect.top - wrapperTop, height: rect.height });
      }
      setPositions(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tbody);
    for (const tr of Array.from(tbody.children)) {
      if (tr instanceof HTMLElement) ro.observe(tr);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // Re-measure whenever the row set changes.
  }, [tbodyRef, rows.length]);

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 h-full w-8"
      aria-hidden={positions.length === 0}
    >
      {positions.map((p) => {
        const active = hoveredId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            data-delete-row-btn=""
            onClick={() => {
              cancelHide();
              onDelete(p.id);
            }}
            onMouseEnter={() => {
              cancelHide();
              setHoveredId(p.id);
            }}
            onMouseLeave={() => scheduleHide()}
            aria-label="Delete row"
            title="Delete row"
            style={{ top: p.top, height: p.height, opacity: active ? 1 : 0 }}
            className={cn(
              'text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive absolute left-1 flex w-6 items-center justify-center rounded-lg transition-opacity',
              active ? 'pointer-events-auto' : 'pointer-events-none'
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

// ─── Cell edit toolbar (mobile, while a cell field is focused) ───────────

/**
 * A minimal floating toolbar shown while a database cell is being edited on
 * mobile. Focusing a cell field blurs the ProseMirror editor, so the page's
 * own block toolbar disappears; this restores undo / redo and a "done" button
 * to dismiss the keyboard. Block-level actions (insert/delete/type) are
 * intentionally omitted — they act on the whole table, not the cell.
 *
 * Buttons use `onMouseDown`-prevent so tapping them doesn't blur the cell
 * (which would dismiss the keyboard and close this bar mid-tap). "Done"
 * blurs deliberately.
 */
function CellEditToolbar({ editor }: { editor: NodeViewProps['editor'] }) {
  const inset = useKeyboardInset();
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-2 lg:hidden"
      style={{ bottom: `calc(${floatingControlBottom(false, inset)} + 0.5rem)` }}
      aria-label="Cell editor toolbar"
    >
      <div className="border-border/60 bg-card/95 pointer-events-auto flex items-center gap-0.5 rounded-2xl border p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!canUndo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.commands.undo()}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            canUndo
              ? 'text-foreground hover:bg-muted/60'
              : 'text-muted-foreground/40 cursor-not-allowed'
          )}
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!canRedo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.commands.redo()}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            canRedo
              ? 'text-foreground hover:bg-muted/60'
              : 'text-muted-foreground/40 cursor-not-allowed'
          )}
        >
          <Redo2 className="h-5 w-5" />
        </button>
        <span className="bg-border/70 mx-0.5 h-5 w-px shrink-0" aria-hidden />
        <button
          type="button"
          aria-label="Done editing"
          title="Done"
          // No mousedown-prevent here — tapping Done should blur the cell,
          // which dismisses the keyboard and closes this bar.
          onClick={() => {
            const el = document.activeElement;
            if (el instanceof HTMLElement) el.blur();
          }}
          className="text-primary hover:bg-primary/10 flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors"
        >
          <Check className="h-4 w-4" /> Done
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── Column header (name + sort + type/delete menu) ─────────────────────

function ColumnHeader({
  column,
  sort,
  editable,
  autoStartEdit,
  onToggleSort,
  onRename,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  sort: false | 'asc' | 'desc';
  editable: boolean;
  autoStartEdit?: boolean;
  onToggleSort: () => void;
  onRename: (name: string) => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const menuOpen = menuAnchor !== null;
  // Seed edit-mode from autoStartEdit on FIRST mount only — a newly-
  // added column mounts a fresh ColumnHeader (keyed on column.id) so
  // the initializer fires exactly when we want it to. React 19 bans
  // setState inside an effect, so this is the right shape.
  const [editing, setEditing] = useState(() => Boolean(autoStartEdit && editable));
  const [mobileSheet, setMobileSheet] = useState(false);
  const [name, setName] = useState(column.name);
  // Long-press detection for mobile — 500ms without moving fires the sheet.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const startPress = () => {
    clearPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setMobileSheet(true);
    }, 500);
  };

  if (!editing && name !== column.name) {
    // Sync external rename into local state without triggering an effect.
    setName(column.name);
  }
  const typeMeta = TYPE_META[column.type];
  const TypeIcon = typeMeta.icon;

  return (
    <div className="group/header relative flex w-full items-stretch">
      <button
        type="button"
        onClick={editable ? onToggleSort : undefined}
        onTouchStart={editable ? startPress : undefined}
        onTouchMove={clearPress}
        onTouchEnd={clearPress}
        onTouchCancel={clearPress}
        onContextMenu={
          // Long-press on desktop also opens the sheet; block the browser menu.
          editable
            ? (e) => {
                e.preventDefault();
                setMobileSheet(true);
              }
            : undefined
        }
        title={sort ? `Sorted ${sort}` : 'Click to sort'}
        className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[0.7rem] font-semibold tracking-[0.08em] uppercase select-none"
      >
        <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', typeMeta.color)} />
        {editable && editing ? (
          <input
            data-col-id={column.id}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== column.name) onRename(name.trim());
              else if (!name.trim()) setName(column.name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(column.name);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            // Intrinsic input widths break table sizing (default size=20
            // ≈ 180px), so we only mount the input while editing. Display
            // mode uses a <span class="truncate"> that respects min-w-0.
            size={1}
            className="text-foreground/85 min-w-0 flex-1 bg-transparent tracking-[0.08em] uppercase outline-none"
          />
        ) : (
          <span
            onDoubleClick={
              editable
                ? (e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }
                : undefined
            }
            title={editable ? 'Double-click to rename' : undefined}
            className="text-foreground/85 min-w-0 flex-1 truncate"
          >
            {column.name}
          </span>
        )}
        {sort === 'asc' && <ArrowUp className="text-primary h-3.5 w-3.5 shrink-0" />}
        {sort === 'desc' && <ArrowDown className="text-primary h-3.5 w-3.5 shrink-0" />}
        {editable && sort === false && (
          <ArrowUpDown className="text-muted-foreground/40 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/header:opacity-100" />
        )}
      </button>
      {/* Desktop only — chevron opens the type/options menu. */}
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor((cur) => (cur ? null : (e.currentTarget as HTMLButtonElement)));
          }}
          aria-label="Column options"
          className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 hidden w-6 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover/header:opacity-100 md:flex"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Desktop only — quick delete-column X in the top-LEFT corner. */}
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete column"
          title="Delete column"
          className="text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive absolute top-0 left-0 hidden h-3.5 w-3.5 items-center justify-center rounded-br-md opacity-0 transition-opacity group-hover/header:opacity-100 md:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {menuOpen && (
        <ColumnMenu
          anchor={menuAnchor}
          column={column}
          onClose={() => setMenuAnchor(null)}
          onChangeType={onChangeType}
          onDelete={onDelete}
          onSetOptions={onSetOptions}
        />
      )}

      {mobileSheet && (
        <ColumnMobileSheet
          column={column}
          sort={sort}
          onClose={() => setMobileSheet(false)}
          onToggleSort={onToggleSort}
          onRename={onRename}
          onChangeType={onChangeType}
          onDelete={onDelete}
          onSetOptions={onSetOptions}
        />
      )}
    </div>
  );
}

/**
 * The column-options popover. Portalled to <body> with fixed positioning
 * so it overlays whatever's below the table — the table container has
 * `overflow-x-auto`, which would otherwise clip a plain `absolute`
 * dropdown on short tables. Closes on outside-click and Escape.
 */
function ColumnMenu({
  anchor,
  column,
  onClose,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  anchor: HTMLElement | null;
  column: DatabaseColumn;
  onClose: () => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [newOption, setNewOption] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = 240;
      // Prefer right-aligned to the trigger; clamp inside viewport.
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (anchor && anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!pos) return null;

  const content = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240 }}
      className="bg-popover text-popover-foreground z-[100] rounded-xl border p-1 shadow-xl"
    >
      <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
        Column type
      </p>
      {(Object.keys(TYPE_META) as DatabaseColumnType[]).map((t) => {
        const Icon = TYPE_META[t].icon;
        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              onChangeType(t);
              // Keep the menu open when switching TO select so the user can
              // immediately edit options; otherwise close it.
              if (t !== 'select') onClose();
            }}
            className={cn(
              'hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
              column.type === t && 'bg-muted/50 font-medium'
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', TYPE_META[t].color)} /> {TYPE_META[t].label}
          </button>
        );
      })}

      {column.type === 'select' && (
        <div className="border-border/50 mt-1 border-t pt-1">
          <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
            Options
          </p>
          <div className="space-y-1 px-1 pb-1">
            {(column.options ?? []).map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              return (
                <div key={opt.id} className="relative flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))}
                    aria-label={`Color for ${opt.label}`}
                    className={cn('h-3.5 w-3.5 shrink-0 rounded-full', c.swatch)}
                  />
                  <span
                    className={cn('flex-1 truncate rounded-md px-2 py-1 text-xs ring-1', c.pill)}
                  >
                    {opt.label}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onSetOptions((column.options ?? []).filter((o) => o.id !== opt.id))
                    }
                    aria-label={`Remove ${opt.label}`}
                    className="text-muted-foreground/60 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {colorPickerFor === opt.id && (
                    <div className="bg-popover absolute top-full left-0 z-[110] mt-1 flex flex-wrap gap-1 rounded-lg border p-1.5 shadow-lg">
                      {SELECT_COLORS.map((sc) => (
                        <button
                          key={sc.key}
                          type="button"
                          onClick={() => {
                            onSetOptions(
                              (column.options ?? []).map((o) =>
                                o.id === opt.id ? { ...o, color: sc.key } : o
                              )
                            );
                            setColorPickerFor(null);
                          }}
                          aria-label={sc.key}
                          className={cn(
                            'h-4 w-4 rounded-full ring-1 ring-white/10 hover:ring-2 hover:ring-white/40',
                            sc.swatch,
                            opt.color === sc.key && 'ring-2 ring-white/70'
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const label = newOption.trim();
                if (!label) return;
                // Cycle colors so successive options are visually distinct.
                const next = SELECT_COLORS[(column.options?.length ?? 0) % SELECT_COLORS.length];
                onSetOptions([...(column.options ?? []), makeSelectOption(label, next.key)]);
                setNewOption('');
              }}
              className="flex gap-1"
            >
              <input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Add option"
                className="border-border/60 bg-background flex-1 rounded-md border px-2 py-1 text-xs outline-none"
              />
              <button
                type="submit"
                className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="border-border/50 mt-1 border-t pt-1">
        <button
          type="button"
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="hover:bg-destructive/10 text-destructive flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete column
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// ─── Mobile column sheet ────────────────────────────────────────────────

/**
 * Bottom-sheet column controls for touch devices. Opened via long-press
 * on the header (or right-click on desktop). Exposes sort / rename /
 * type-change / options / delete in a single scrollable pane.
 */
function ColumnMobileSheet({
  column,
  sort,
  onClose,
  onToggleSort,
  onRename,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  sort: false | 'asc' | 'desc';
  onClose: () => void;
  onToggleSort: () => void;
  onRename: (name: string) => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [nameDraft, setNameDraft] = useState(column.name);
  const [newOption, setNewOption] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== column.name) onRename(trimmed);
    else setNameDraft(column.name);
  };

  const setSort = (dir: 'asc' | 'desc') => {
    // Toggle-sort cycles asc → desc → off; iterate to reach the desired state.
    let safety = 3;
    while (sort !== dir && safety-- > 0) onToggleSort();
    onClose();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        // Changing type calls updateAttributes on the Tiptap node, which
        // can pull focus back into the editor. Radix treats that as an
        // outside interaction and closes the sheet — so we swallow those
        // events. The X button in the header still calls onOpenChange
        // directly, and Delete-column closes explicitly.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0 sm:bottom-4 sm:mx-auto sm:h-auto sm:max-w-md sm:rounded-2xl sm:border"
      >
        <SheetHeader className="border-border/40 border-b p-4">
          <SheetTitle className="text-left text-base">{column.name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Rename */}
          <label className="text-muted-foreground mb-2 block text-[10px] font-semibold tracking-wider uppercase">
            Name
          </label>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            className="border-border/60 bg-background focus:border-primary/60 w-full rounded-lg border px-3 py-2.5 text-base outline-none"
          />

          {/* Sort */}
          <p className="text-muted-foreground mt-5 mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Sort
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSort('asc')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm',
                sort === 'asc'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/60 hover:bg-muted/50'
              )}
            >
              <ArrowUp className="h-4 w-4" /> Ascending
            </button>
            <button
              type="button"
              onClick={() => setSort('desc')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm',
                sort === 'desc'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/60 hover:bg-muted/50'
              )}
            >
              <ArrowDown className="h-4 w-4" /> Descending
            </button>
          </div>

          {/* Type */}
          <p className="text-muted-foreground mt-5 mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_META) as DatabaseColumnType[]).map((t) => {
              const Icon = TYPE_META[t].icon;
              const active = column.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChangeType(t)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    active
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/60 hover:bg-muted/50'
                  )}
                >
                  <Icon className={cn('h-4 w-4', TYPE_META[t].color)} />
                  {TYPE_META[t].label}
                </button>
              );
            })}
          </div>

          {/* Options (select only) */}
          {column.type === 'select' && (
            <>
              <p className="text-muted-foreground mt-5 mb-2 text-[10px] font-semibold tracking-wider uppercase">
                Options
              </p>
              <div className="space-y-2">
                {(column.options ?? []).map((opt, i) => {
                  const c = resolveOptionColor(opt, i);
                  return (
                    <div key={opt.id} className="relative">
                      <div className="border-border/60 flex items-center gap-2 rounded-lg border px-2 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))
                          }
                          aria-label={`Color for ${opt.label}`}
                          className={cn('h-5 w-5 shrink-0 rounded-full', c.swatch)}
                        />
                        <span
                          className={cn(
                            'flex-1 truncate rounded-md px-2 py-1 text-sm ring-1',
                            c.pill
                          )}
                        >
                          {opt.label}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onSetOptions((column.options ?? []).filter((o) => o.id !== opt.id))
                          }
                          aria-label={`Remove ${opt.label}`}
                          className="text-muted-foreground/70 hover:text-destructive flex h-8 w-8 items-center justify-center"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {colorPickerFor === opt.id && (
                        <div className="bg-popover mt-1 flex flex-wrap gap-1.5 rounded-lg border p-2 shadow-lg">
                          {SELECT_COLORS.map((sc) => (
                            <button
                              key={sc.key}
                              type="button"
                              onClick={() => {
                                onSetOptions(
                                  (column.options ?? []).map((o) =>
                                    o.id === opt.id ? { ...o, color: sc.key } : o
                                  )
                                );
                                setColorPickerFor(null);
                              }}
                              aria-label={sc.key}
                              className={cn(
                                'h-7 w-7 rounded-full ring-1 ring-white/10',
                                sc.swatch,
                                opt.color === sc.key && 'ring-2 ring-white/70'
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newOption.trim();
                    if (!label) return;
                    const next =
                      SELECT_COLORS[(column.options?.length ?? 0) % SELECT_COLORS.length];
                    onSetOptions([...(column.options ?? []), makeSelectOption(label, next.key)]);
                    setNewOption('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option"
                    className="border-border/60 bg-background flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    Add
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Destructive footer */}
        <div className="border-border/40 border-t p-4">
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="hover:bg-destructive/10 text-destructive border-destructive/40 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            <Trash2 className="h-4 w-4" /> Delete column
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Cell editors ────────────────────────────────────────────────────────

/**
 * Text cell: a textarea (not an input) so long values wrap onto multiple lines
 * and the row grows to fit. Auto-sizes with the CSS "grid replica" technique —
 * an invisible sibling holds the same wrapped text and drives the shared grid
 * cell's height; the textarea stretches to fill it. This is font/measure-safe
 * (no JS height, no `field-sizing` support gap) so the line never clips on
 * mobile the way a `scrollHeight` measurement taken before web-font load does.
 * The replica and textarea MUST keep identical text metrics (padding, size,
 * leading, wrapping) or the two heights diverge.
 */
function TextCell({
  value,
  onChange,
  disabled,
  isPrimary,
}: {
  value: string;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
  isPrimary?: boolean;
}) {
  // Primary column reads as the row title — bold + full-strength text.
  // Non-primary cells stay in the softer body weight so the "name" column
  // clearly leads the eye, matching Notion.
  const typography = cn(
    'px-3 py-3.5 text-sm leading-snug break-words whitespace-pre-wrap',
    isPrimary && 'font-semibold text-foreground'
  );
  return (
    <div className="grid min-w-0">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={1}
        dir="auto"
        className={cn(
          typography,
          'col-start-1 row-start-1 w-full resize-none overflow-hidden bg-transparent outline-none'
        )}
      />
      {/* Invisible size-driver: same text + metrics as the textarea. The
          trailing space makes a trailing newline (and an empty value) reserve
          a line so the box never collapses below the visible text. */}
      <div aria-hidden dir="auto" className={cn(typography, 'invisible col-start-1 row-start-1')}>
        {value + ' '}
      </div>
    </div>
  );
}

function CellEditor({
  column,
  value,
  onChange,
  editable,
  isPrimary,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  editable: boolean;
  /** True for the first-column cell — used only by TextCell for bolding. */
  isPrimary?: boolean;
}) {
  const disabled = !editable;
  switch (column.type) {
    case 'text':
      return (
        <TextCell
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
          isPrimary={isPrimary}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value == null ? '' : (value as number)}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            onChange(Number.isFinite(v as number) || v === null ? v : null);
          }}
          disabled={disabled}
          className="w-full bg-transparent px-3 py-3.5 text-right text-sm tabular-nums outline-none"
        />
      );
    case 'date':
      return <DateCell value={value} onChange={onChange} disabled={disabled} />;
    case 'checkbox':
      return (
        <div className="flex h-full items-center justify-center py-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4"
          />
        </div>
      );
    case 'select':
      return <SelectCell column={column} value={value} onChange={onChange} disabled={disabled} />;
  }
}

/**
 * Date cell — replaces the native <input type="date">, which showed an
 * ugly `dd/mm/yyyy` placeholder for empty values. Formatted date when
 * set, em-dash when empty. Click reveals a hidden native input for
 * editing (native picker still opens on click).
 */
function DateCell({
  value,
  onChange,
  disabled,
}: {
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
}) {
  const dateStr = typeof value === 'string' ? value : '';
  const display = dateStr ? formatDateForDisplay(dateStr) : '—';
  return (
    <label className="relative flex h-full w-full items-center px-3 py-3.5 text-sm">
      <input
        type="date"
        value={dateStr}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        // Native input is transparent + absolutely sized to cover the cell
        // so the click target matches the visible pill without showing the
        // "dd/mm/yyyy" placeholder text.
        className={cn(
          'absolute inset-0 h-full w-full cursor-pointer bg-transparent px-3 py-3.5 opacity-0',
          disabled && 'cursor-not-allowed'
        )}
      />
      <span className={cn(dateStr ? 'text-foreground/90' : 'text-muted-foreground/50')}>
        {display}
      </span>
    </label>
  );
}

function formatDateForDisplay(iso: string): string {
  // ISO date → dd/mm/yyyy for display. Preserves the raw ISO on the
  // wire; only the visible label changes.
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Custom select cell. Uses a colored pill for the current value and a
 * portalled popover for picking / clearing — a native `<select>` can't
 * render the per-option color, and we want click-outside to dismiss.
 */
function SelectCell({
  column,
  value,
  onChange,
  disabled,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
}) {
  const options = column.options ?? [];
  const selectedId = typeof value === 'string' ? value : '';
  const selected = options.find((o) => o.id === selectedId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(180, rect.width);
      const left = Math.min(rect.left, window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedIndex = selected ? options.findIndex((o) => o.id === selected.id) : -1;
  const selColor = selected ? resolveOptionColor(selected, Math.max(0, selectedIndex)) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${column.name}: ${selected?.label ?? 'empty'}`}
        className="flex h-full w-full items-center px-3 py-3.5 text-left text-sm"
      >
        {selected && selColor ? (
          // Pill: rounded-full with a leading colored dot, Notion-style.
          // The dot is the same color family as the pill so a quick glance
          // groups by category without reading the label.
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              selColor.pill
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', selColor.swatch)} aria-hidden />
            {selected.label}
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">—</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
            className="bg-popover text-popover-foreground z-[100] max-h-64 overflow-y-auto rounded-xl border p-1 shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="hover:bg-muted/60 text-muted-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
            >
              <X className="h-3 w-3" /> Clear
            </button>
            {options.map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', c.swatch)} />
                  <span className={cn('rounded-md px-1.5 py-0.5 ring-1', c.pill)}>{opt.label}</span>
                </button>
              );
            })}
            {options.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                No options — add some in the column menu.
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

// ─── Sort + type coercion helpers ────────────────────────────────────────

function sortByType(col: DatabaseColumn, a: DatabaseCellValue, b: DatabaseCellValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  switch (col.type) {
    case 'number':
      return (Number(a) || 0) - (Number(b) || 0);
    case 'checkbox':
      return Number(Boolean(a)) - Number(Boolean(b));
    case 'select': {
      const opts = col.options ?? [];
      const ia = opts.findIndex((o) => o.id === a);
      const ib = opts.findIndex((o) => o.id === b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    }
    case 'date':
    case 'text':
    default:
      return String(a).localeCompare(String(b));
  }
}

function coerceValue(raw: DatabaseCellValue, type: DatabaseColumnType): DatabaseCellValue {
  if (raw == null) return type === 'checkbox' ? false : null;
  switch (type) {
    case 'text':
      return String(raw);
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
      return typeof raw === 'string' ? raw : null;
    case 'checkbox':
      return Boolean(raw);
    case 'select':
      return typeof raw === 'string' ? raw : null;
  }
}
