'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Baseline,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Hash,
  Menu as MenuIcon,
  Maximize2,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import {
  moveAxis,
  isStationary,
  shouldEngageDeleteSwipe,
  clampReveal,
  resolveSwipeEnd,
  LONG_PRESS_MS,
  SWIPE_REVEAL_PX,
} from './db-row-gesture';
import { setRowBody, hasBodyContent } from '@/lib/pages/db-rows';
import { DatabaseEntrySheet } from './database-entry-sheet';
import { floatingControlBottom } from './undo-redo-bar';
import { cn } from '@/lib/utils';
import {
  cellMatchesFilter,
  isColumnFilterActive,
  seedValueForFilter,
  type ColumnFilter,
} from './db-filter';
import { DatabaseFilterPanel } from './database-filter-panel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, parseISO, isValid } from 'date-fns';
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

// Type icons are drawn muted to match the mock — a monochrome iconography
// row keeps the eye on the column names, not on chromatic distinctions.
const TYPE_META: Record<
  DatabaseColumnType,
  { label: string; icon: typeof Baseline; color: string }
> = {
  text: { label: 'Text', icon: Baseline, color: 'text-muted-foreground' },
  number: { label: 'Number', icon: Hash, color: 'text-muted-foreground' },
  date: { label: 'Date', icon: Calendar, color: 'text-muted-foreground' },
  select: { label: 'Select', icon: ChevronDown, color: 'text-muted-foreground' },
  multiselect: { label: 'Multi-select', icon: MenuIcon, color: 'text-muted-foreground' },
  checkbox: { label: 'Checkbox', icon: Check, color: 'text-muted-foreground' },
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

export function getSelectColor(key: string | undefined) {
  return SELECT_COLORS.find((c) => c.key === key) ?? SELECT_COLORS[0];
}

/**
 * Best-effort color for an option that pre-dates the `color` field. We
 * cycle through the palette by index so a legacy 3-option column
 * (Todo/Doing/Done) reads as three distinct colors instead of three
 * grey pills.
 */
export function resolveOptionColor(
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
  const title = (node.attrs.title as string | null) ?? '';
  const setTitle = (next: string) => updateAttributes({ title: next });

  // Always-fresh view of rows for DEFERRED writes. The row-detail body commit is
  // debounced (~400ms) and also flushed on unmount, so a callback that closed
  // over the render-time `rows` would fire against a stale snapshot and clobber
  // any cell edit made in the meantime. Reading `rowsRef.current` at call time
  // makes deferred writes merge into the latest rows instead.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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
  // View-state additions from the redesigned header: free-text search across
  // all cells, sort picker popover, fullscreen dialog, and a collapse toggle
  // that hides the table body while keeping the header visible.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  // Global filter fn: naive stringify-any-cell match. Kept local so
  // number/date/select all become searchable via their displayed form.
  const globalFilterFn = useMemo(
    () => (row: { original: DatabaseRow }, _colId: string, filterValue: string) => {
      const q = String(filterValue ?? '')
        .trim()
        .toLowerCase();
      if (!q) return true;
      for (const col of columns) {
        const v = row.original.cells[col.id];
        if (v == null || v === false) continue;
        if (Array.isArray(v)) {
          // Multi-select values are arrays of option ids — resolve to labels.
          const labels = (col.options ?? [])
            .filter((o) => (v as string[]).includes(o.id))
            .map((o) => o.label);
          if (labels.some((l) => l.toLowerCase().includes(q))) return true;
          continue;
        }
        if (col.type === 'select' && typeof v === 'string') {
          const label = col.options?.find((o) => o.id === v)?.label ?? v;
          if (String(label).toLowerCase().includes(q)) return true;
          continue;
        }
        if (String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    },
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, columnFilters, globalFilter: searchQuery },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
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
      // Read the freshest rows (see rowsRef) so this never overwrites a
      // concurrent body/cell edit.
      setRows(
        rowsRef.current.map((r) =>
          r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Row detail view (open as a page/card). On mobile, tapping a row opens it
  // full-screen; on desktop a hover-revealed icon on the primary cell opens a
  // right-hand side panel.
  const isMobile = useIsMobileViewport();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const openRow = openRowId ? (rows.find((r) => r.id === openRowId) ?? null) : null;
  const updateRowBody = useCallback(
    // Deferred (debounced/unmount-flush) — read the freshest rows so a late
    // body commit merges with, rather than reverts, interleaved cell edits.
    (rowId: string, body: unknown) => setRows(setRowBody(rowsRef.current, rowId, body)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
    // Read the freshest rows (rowsRef) so this can't drop a pending body commit.
    setRows([...rowsRef.current, row]);
    setFocusIntent({ kind: 'row', id: row.id });
  };
  const deleteRow = (rowId: string) => {
    setRows(rowsRef.current.filter((r) => r.id !== rowId));
    if (openRowId === rowId) setOpenRowId(null);
  };

  // ── Mobile row gestures ──────────────────────────────────────────────
  // tap a cell → edit it (cells are interactive); long-press anywhere → open
  // the entry card; swipe right while scrolled fully left → reveal a red delete
  // button. See ./db-row-gesture for the pure decision helpers + tests.
  const [swipe, setSwipe] = useState<{
    rowId: string;
    dx: number;
    open: boolean;
    dragging: boolean;
    top: number;
    height: number;
  } | null>(null);
  const gesture = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    phase: 'pending' | 'swipe' | 'scroll';
    moved: boolean;
    longPress: boolean;
    /** This touch began while a swipe was open → its job is just to dismiss it. */
    dismiss: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    band: { top: number; height: number };
  } | null>(null);

  const closeSwipe = useCallback(() => setSwipe(null), []);

  // Clear any pending long-press timer on unmount so it can't fire (and setState)
  // after the block is gone.
  useEffect(() => {
    return () => {
      if (gesture.current?.timer) clearTimeout(gesture.current.timer);
    };
  }, []);

  // A swipe open on one row should close when the table is scrolled or another
  // row is touched — the touchStart handler covers the latter.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !swipe) return;
    const onScroll = () => setSwipe(null);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipe?.rowId]);

  const onRowTouchStart = (e: React.TouchEvent, rowId: string) => {
    if (!isMobile || !editable) return;
    // Never leave a previous long-press timer pending (multi-touch / re-touch).
    if (gesture.current?.timer) clearTimeout(gesture.current.timer);
    // A touch that starts while a swipe is OPEN just dismisses it (and suppresses
    // the trailing cell tap); it neither long-presses nor edits.
    const dismiss = !!swipe?.open;
    if (swipe) setSwipe(null);
    const t = e.touches[0];
    if (!t) return;
    const trRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const wrapRect = wrapperRef.current?.getBoundingClientRect();
    const band = wrapRect
      ? {
          top: trRect.top - wrapRect.top + (wrapperRef.current?.scrollTop ?? 0),
          height: trRect.height,
        }
      : { top: 0, height: trRect.height };
    gesture.current = {
      startX: t.clientX,
      startY: t.clientY,
      scrollLeft: wrapperRef.current?.scrollLeft ?? 0,
      phase: 'pending',
      moved: false,
      longPress: false,
      dismiss,
      // No long-press while dismissing — the first touch just closes the swipe.
      timer: dismiss
        ? null
        : setTimeout(() => {
            const g = gesture.current;
            if (g && !g.moved) {
              g.longPress = true;
              setSwipe(null);
              setOpenRowId(rowId);
            }
          }, LONG_PRESS_MS),
      band,
    };
  };

  const onRowTouchMove = (e: React.TouchEvent, rowId: string) => {
    const g = gesture.current;
    if (!g) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    if (!g.moved && !isStationary(dx, dy)) {
      g.moved = true;
      if (g.timer) {
        clearTimeout(g.timer);
        g.timer = null;
      }
    }
    if (g.phase === 'scroll') return; // let the browser scroll
    if (g.phase === 'pending') {
      if (shouldEngageDeleteSwipe(dx, dy, g.scrollLeft <= 0)) g.phase = 'swipe';
      else if (moveAxis(dx, dy) !== 'none') {
        g.phase = 'scroll';
        return;
      } else return;
    }
    // Engaged swipe — reveal the delete button. No preventDefault needed: we
    // only engage at the left scroll edge, where a rightward drag can't scroll.
    setSwipe({
      rowId,
      dx: clampReveal(dx),
      open: false,
      dragging: true,
      top: g.band.top,
      height: g.band.height,
    });
  };

  const onRowTouchEnd = (e: React.TouchEvent, rowId: string) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.timer) clearTimeout(g.timer);
    if (!g) return;
    // Long-press already opened the card, or this touch dismissed an open swipe:
    // swallow the synthesized click/focus so the cell under the finger doesn't
    // also enter edit mode.
    if (g.longPress || (g.dismiss && !g.moved)) {
      e.preventDefault();
      return;
    }
    if (g.phase !== 'swipe') return; // a tap → let the cell's own editor handle it
    setSwipe((s) => {
      if (!s || s.rowId !== rowId) return null;
      // Past the threshold → snap open; otherwise animate back to closed (keep
      // the row mounted at dx:0 so the transition runs instead of jumping).
      return resolveSwipeEnd(s.dx)
        ? { ...s, dx: SWIPE_REVEAL_PX, open: true, dragging: false }
        : { ...s, dx: 0, open: false, dragging: false };
    });
  };

  const addColumn = () => {
    const col = makeColumn('New column', 'text');
    setColumns([...columns, col]);
    setRows(rowsRef.current.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: null } })));
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
        const hasOptions = type === 'select' || type === 'multiselect';
        if (hasOptions && !next.options) next.options = [];
        if (!hasOptions) delete next.options;
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

  // ─── Header ──────────────────────────────────────────────────────────
  // Left cluster: collapse chevron + title. Right cluster: search / filter /
  // sort / fullscreen icon-buttons. Filter and sort tint primary when they
  // hold active state — matches the mock's orange-outlined icons.
  const headerNode = columns.length > 0 && (
    <div className="mb-0 px-4 pt-3 pb-2">
      <div className="relative flex w-full items-center gap-2">
        {/* Collapse chevron. Points right when the body is hidden. */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand database' : 'Collapse database'}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {editable ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            dir="auto"
            aria-label="Database title"
            className="text-foreground placeholder:text-muted-foreground/40 min-w-0 flex-1 truncate bg-transparent text-2xl font-semibold outline-none"
          />
        ) : (
          <span className="text-foreground min-w-0 flex-1 truncate text-2xl font-semibold">
            {title}
          </span>
        )}
        {/* Right-cluster icon buttons — all four are compact rounded squares. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <HeaderIconButton
            onClick={() => setSearchOpen((o) => !o)}
            active={searchOpen || searchQuery.length > 0}
            label="Search rows"
          >
            <Search className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton
            ref={filterBtnRef}
            onClick={() => setFilterPanelOpen((o) => !o)}
            active={activeFilterColumns.length > 0}
            label="Filter rows"
            badge={activeFilterColumns.length > 0 ? activeFilterColumns.length : undefined}
          >
            <Filter className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton
            ref={sortBtnRef}
            onClick={() => setSortMenuOpen((o) => !o)}
            active={sorting.length > 0}
            label="Sort rows"
          >
            <ArrowUpDown className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton
            onClick={() => setFullscreenOpen(true)}
            active={false}
            label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </HeaderIconButton>
        </div>
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
        {sortMenuOpen && sortBtnRef.current && (
          <SortMenu
            columns={columns}
            sorting={sorting}
            anchorEl={sortBtnRef.current}
            onChange={setSorting}
            onClose={() => setSortMenuOpen(false)}
          />
        )}
      </div>
      {searchOpen && (
        <div className="mt-2 flex items-center gap-2">
          <div className="border-border/60 bg-background focus-within:border-primary/50 flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5">
            <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rows…"
              className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  setSearchOpen(false);
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      {activeFilterColumns.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeFilterColumns.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => clearColumnFilter(col.id)}
              title={`Clear filter on ${col.name}`}
              className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            >
              <span className="max-w-[10rem] truncate">
                {activeFilterLabel(col, filters[col.id])}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <NodeViewWrapper as="div" className="database-block group/db relative my-4 pl-9">
      <div className="db-frame">
        {headerNode}
        {collapsed ? null : (
          <div ref={wrapperRef} className="db-table-scroll relative">
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
                  <tr key={headerGroup.id}>
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
                            autoStartEdit={
                              focusIntent?.kind === 'column' && focusIntent.id === col.id
                            }
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
                  // Cells are inline-editable on every viewport now. On mobile the
                  // row also carries gesture handlers: tap a cell = edit it,
                  // long-press = open the entry card, swipe-right-at-left-edge =
                  // reveal delete (see onRowTouch* + the delete overlay below).
                  const cellEditable = editable;
                  // Keep the open icon always visible when the row has a page
                  // (body content) or on mobile; otherwise reveal it on hover.
                  const rowHasBody = hasBodyContent(row.body);
                  const swiped = swipe?.rowId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="group/row"
                      data-row-id={row.id}
                      style={
                        swiped
                          ? {
                              transform: `translateX(${swipe!.dx}px)`,
                              transition: swipe!.dragging ? 'none' : 'transform 180ms ease-out',
                            }
                          : undefined
                      }
                      onTouchStart={
                        isMobile && editable ? (e) => onRowTouchStart(e, row.id) : undefined
                      }
                      onTouchMove={
                        isMobile && editable ? (e) => onRowTouchMove(e, row.id) : undefined
                      }
                      onTouchEnd={
                        isMobile && editable ? (e) => onRowTouchEnd(e, row.id) : undefined
                      }
                      onTouchCancel={
                        isMobile && editable ? (e) => onRowTouchEnd(e, row.id) : undefined
                      }
                      onContextMenu={isMobile && editable ? (e) => e.preventDefault() : undefined}
                    >
                      {tableRow.getVisibleCells().map((cell, cellIdx) => {
                        const col = columns.find((c) => c.id === cell.column.id);
                        if (!col) return null;
                        // First column reads as the row's primary label — bold it
                        // (Notion-style) so scanning a long table is easy.
                        const isPrimary = cellIdx === 0;
                        const cellEditor = (
                          <CellEditor
                            column={col}
                            value={row.cells[col.id]}
                            onChange={(v) => updateCell(row.id, col.id, v)}
                            editable={cellEditable}
                            isPrimary={isPrimary}
                          />
                        );
                        return (
                          <td key={cell.id} className="p-0 align-top">
                            {isPrimary ? (
                              <div className="flex items-center gap-2">
                                <div className="min-w-0 flex-1">{cellEditor}</div>
                                {/* Passive "row has notes" indicator — the lines
                                    icon reads at a glance without demanding a
                                    click. Mobile-visible; on desktop it stays
                                    even when the row isn't hovered so scanning
                                    for annotated rows works vertically. */}
                                {rowHasBody && (
                                  <AlignLeft
                                    aria-label="Row has notes"
                                    className="text-muted-foreground/70 h-4 w-4 shrink-0"
                                  />
                                )}
                                {/* Bordered Open button — icon + label. Revealed
                                    on row hover on desktop; always visible on
                                    mobile since hover doesn't fire there. */}
                                <button
                                  type="button"
                                  draggable={false}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenRowId(row.id);
                                  }}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  aria-label="Open entry"
                                  title="Open entry"
                                  className={cn(
                                    'border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground mr-2 inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-opacity',
                                    isMobile
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover/row:opacity-100'
                                  )}
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                  Open
                                </button>
                              </div>
                            ) : (
                              cellEditor
                            )}
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

            {/* Swipe-reveal delete (mobile). Sits in the gap the row uncovers as it
            translates right; tap to delete. Positioned over the row's band. */}
            {isMobile && swipe && (
              <button
                type="button"
                aria-label="Delete row"
                title="Delete row"
                onClick={() => {
                  deleteRow(swipe.rowId);
                  closeSwipe();
                }}
                style={{
                  position: 'absolute',
                  top: swipe.top,
                  height: swipe.height,
                  left: 0,
                  width: swipe.open ? SWIPE_REVEAL_PX : swipe.dx,
                }}
                className="bg-destructive text-destructive-foreground flex items-center justify-center overflow-hidden"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        )}
      </div>

      {editable && !collapsed && (
        <DeleteRowGutter tbodyRef={tbodyRef} rows={rows} onDelete={deleteRow} />
      )}

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

      <DatabaseEntrySheet
        row={openRow}
        columns={columns}
        editable={editable}
        onUpdateCell={updateCell}
        onUpdateBody={updateRowBody}
        onDeleteRow={deleteRow}
        onOpenChange={(open) => !open && setOpenRowId(null)}
      />

      {/* Fullscreen overlay — dedicated portal that renders a second copy
          of the frame content at viewport size. Keeping the primary frame
          in the flow means all in-flight edit state stays put; the overlay
          just mirrors visually while the user is expanded. */}
      {fullscreenOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="bg-background/70 fixed inset-0 z-50 backdrop-blur-sm">
            <button
              type="button"
              aria-label="Close fullscreen"
              onClick={() => setFullscreenOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default"
            />
            <div className="pointer-events-none absolute inset-4 flex items-start justify-center md:inset-8">
              <div className="bg-card border-border/40 pointer-events-auto flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-xl">
                <div className="border-border/40 flex items-center gap-2 border-b px-4 py-3">
                  <span className="text-foreground flex-1 truncate text-2xl font-semibold">
                    {title || 'Untitled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFullscreenOpen(false)}
                    aria-label="Close"
                    className="text-muted-foreground hover:bg-muted/60 hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-muted-foreground px-4 py-6 text-sm">
                  Editing here mirrors the block on the page — collapse the overlay to interact with
                  the full column controls.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}

/** Compact rounded-square icon button used across the DB header. */
const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  {
    onClick: () => void;
    active: boolean;
    label: string;
    badge?: number;
    children: React.ReactNode;
  }
>(function HeaderIconButton({ onClick, active, label, badge, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
        active
          ? 'border-primary/50 text-primary bg-primary/5'
          : 'border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      )}
    >
      {children}
      {badge !== undefined && (
        <span className="text-primary absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
});

/** Sort-picker popover: one row per column with asc/desc/clear toggles. */
function SortMenu({
  columns,
  sorting,
  anchorEl,
  onChange,
  onClose,
}: {
  columns: DatabaseColumn[];
  sorting: SortingState;
  anchorEl: HTMLElement;
  onChange: (next: SortingState) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    // Defer to avoid the cascading-render lint (setState synchronously
    // inside an effect); the popup is fine to paint a frame later.
    queueMicrotask(() => setPos({ top: r.bottom + 6, left: r.right - 240 }));
  }, [anchorEl]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchorEl.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [anchorEl, onClose]);
  if (!pos) return null;
  const activeId = sorting[0]?.id ?? null;
  const activeDir = sorting[0]?.desc ? 'desc' : sorting[0] ? 'asc' : null;
  const setSort = (id: string, dir: 'asc' | 'desc' | null) => {
    if (dir === null) onChange([]);
    else onChange([{ id, desc: dir === 'desc' }]);
  };
  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: Math.max(8, pos.left), width: 240 }}
      className="bg-popover text-popover-foreground z-[100] rounded-xl border p-1 shadow-xl"
    >
      <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
        Sort by
      </p>
      {columns.map((c) => {
        const isActive = c.id === activeId;
        return (
          <div
            key={c.id}
            className={cn(
              'flex items-center gap-1 rounded-lg px-1.5 py-1',
              isActive && 'bg-muted/40'
            )}
          >
            <span className="text-foreground/85 flex-1 truncate text-xs">{c.name}</span>
            <button
              type="button"
              onClick={() => setSort(c.id, isActive && activeDir === 'asc' ? null : 'asc')}
              aria-label={`Sort ${c.name} ascending`}
              className={cn(
                'hover:bg-muted/60 flex h-6 w-6 items-center justify-center rounded-md',
                isActive && activeDir === 'asc' && 'bg-primary/10 text-primary'
              )}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSort(c.id, isActive && activeDir === 'desc' ? null : 'desc')}
              aria-label={`Sort ${c.name} descending`}
              className={cn(
                'hover:bg-muted/60 flex h-6 w-6 items-center justify-center rounded-md',
                isActive && activeDir === 'desc' && 'bg-primary/10 text-primary'
              )}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {sorting.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs"
        >
          Clear sort
        </button>
      )}
    </div>,
    document.body
  );
}

/** Chip label for an active filter — "Status is not Killed" style. */
function activeFilterLabel(col: DatabaseColumn, f: ColumnFilter | undefined): string {
  if (!f) return col.name;
  const op = filterOperatorText(f);
  const val = filterValueText(col, f);
  return val ? `${col.name} ${op} ${val}` : `${col.name} ${op}`;
}
function filterOperatorText(f: ColumnFilter): string {
  const op = (f as { op?: string }).op ?? '';
  if (op === 'not') return 'is not';
  if (op === 'contains') return 'contains';
  if (op === 'notContains') return 'does not contain';
  if (op === 'empty') return 'is empty';
  if (op === 'nonEmpty') return 'is not empty';
  if (op === 'gt') return '>';
  if (op === 'lt') return '<';
  if (op === 'gte') return '>=';
  if (op === 'lte') return '<=';
  if (op === 'is' || op === 'eq') return 'is';
  return 'is';
}
function filterValueText(col: DatabaseColumn, f: ColumnFilter): string {
  const v = (f as { value?: unknown }).value;
  if (v == null || v === '') return '';
  if (Array.isArray(v)) {
    const labels = (col.options ?? [])
      .filter((o) => (v as string[]).includes(o.id))
      .map((o) => o.label);
    return labels.join(', ');
  }
  if (col.type === 'select' && typeof v === 'string') {
    return col.options?.find((o) => o.id === v)?.label ?? String(v);
  }
  return String(v);
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
  // Clicking the header text toggles a small icon row below it
  // (chevron / sort / delete). Click outside collapses.
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState(column.name);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      setExpanded(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [expanded]);
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

  const SortIcon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <div
      ref={rootRef}
      // Header cell keeps its compact vertical size. When the label is
      // clicked, the icon row floats absolutely BELOW the header
      // (position: absolute + top: 100%) so the table doesn't move.
      // The label itself lifts a couple pixels as a subtle affordance.
      className="group/header relative flex w-full items-center gap-1.5 py-2 pr-2 pl-3"
    >
      {/* Type icon leads the column name, muted like the label. */}
      <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', typeMeta.color)} aria-hidden />
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
          size={1}
          className="text-muted-foreground min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={editable ? () => setExpanded((v) => !v) : undefined}
          onDoubleClick={
            editable
              ? (e) => {
                  e.stopPropagation();
                  setEditing(true);
                }
              : undefined
          }
          onTouchStart={editable ? startPress : undefined}
          onTouchMove={clearPress}
          onTouchEnd={clearPress}
          onTouchCancel={clearPress}
          onContextMenu={
            editable
              ? (e) => {
                  e.preventDefault();
                  setMobileSheet(true);
                }
              : undefined
          }
          title={editable ? 'Click for column actions · double-click to rename' : undefined}
          className={cn(
            'text-muted-foreground min-w-0 flex-1 truncate text-left text-sm font-medium transition-transform select-none',
            expanded && 'text-foreground'
          )}
        >
          {column.name}
        </button>
      )}

      {/* Inline action row — chevron, sort, trash. Absolute so the header
          cell stays compact; the icon row floats just below the header,
          overlaying the tiny row-spacing gap without pushing rows down. */}
      {editable && expanded && !editing && (
        // Icons carry no colour by default — hovering each one paints the
        // action semantic tint (chevron → pastel green, sort → primary
        // pastel blue, trash → pastel red).
        <div className="pointer-events-auto absolute top-full left-3 z-20 -mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor((cur) => (cur ? null : (e.currentTarget as HTMLButtonElement)));
            }}
            aria-label="Column options"
            title="Column options"
            className="text-muted-foreground flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-emerald-400/10 hover:text-emerald-400"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSort();
            }}
            aria-label={sort ? `Sorted ${sort} — cycle` : 'Sort'}
            title={sort ? `Sorted ${sort}` : 'Sort'}
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          >
            <SortIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete column"
            title="Delete column"
            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {menuOpen && (
        <ColumnMenu
          anchor={menuAnchor}
          column={column}
          onClose={() => setMenuAnchor(null)}
          onChangeType={onChangeType}
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
  onSetOptions,
}: {
  anchor: HTMLElement | null;
  column: DatabaseColumn;
  onClose: () => void;
  onChangeType: (type: DatabaseColumnType) => void;
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
              // Keep the menu open when switching TO a select/multiselect so the
              // user can immediately edit options; otherwise close it.
              if (t !== 'select' && t !== 'multiselect') onClose();
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

      {(column.type === 'select' || column.type === 'multiselect') && (
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

      {/* Delete column moved out of this popover — the header's inline
          action row (trash icon) is the single place to trigger it. */}
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

          {/* Options (select / multi-select) */}
          {(column.type === 'select' || column.type === 'multiselect') && (
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
  // A URL-only value renders as a compact "link" affordance — a clickable
  // blue underlined label — instead of exposing the raw URL. The raw string
  // stays editable via the row detail view (long-press / open-row on the
  // primary cell); this keeps the compact table readable when a cell holds
  // a percent-encoded link that would otherwise blow up the row height.
  const trimmed = value.trim();
  const isUrlValue = /^https?:\/\/\S+$/.test(trimmed);

  // Primary column reads as the row title — bold + full-strength text.
  // Non-primary cells stay in the softer body weight so the "name" column
  // clearly leads the eye, matching Notion.
  const typography = cn(
    'px-3 py-2 text-sm leading-snug break-words whitespace-pre-wrap',
    isPrimary && 'font-semibold text-foreground'
  );

  if (isUrlValue) {
    return (
      <div className="min-w-0 px-3 py-2 text-sm leading-snug">
        <a
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={trimmed}
          className="text-primary hover:text-primary/80 underline underline-offset-2"
        >
          link
        </a>
      </div>
    );
  }

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
          className="w-full bg-transparent px-3 py-2 text-center text-sm tabular-nums outline-none"
        />
      );
    case 'date':
      return <DateCell value={value} onChange={onChange} disabled={disabled} />;
    case 'checkbox': {
      const checked = Boolean(value);
      return (
        <div className="flex h-full items-center justify-center py-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
              checked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-border/60 bg-background hover:border-primary/50'
            )}
          >
            {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </button>
        </div>
      );
    }
    case 'select':
      return <SelectCell column={column} value={value} onChange={onChange} disabled={disabled} />;
    case 'multiselect':
      return (
        <MultiSelectCell column={column} value={value} onChange={onChange} disabled={disabled} />
      );
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
  const parsed = dateStr ? parseISO(dateStr) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;
  const display = date ? format(date, 'dd/MM/yyyy') : '—';
  const [open, setOpen] = useState(false);

  return (
    // Uses shadcn Popover + Calendar (same components used elsewhere in
    // the app) instead of the native <input type="date"> UI — that native
    // picker was styled by the browser and jarringly out of sync with
    // the rest of the dark theme.
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-full w-full items-center justify-center px-3 py-2 text-sm outline-none',
            disabled && 'cursor-not-allowed'
          )}
        >
          <span className={cn(date ? 'text-foreground/90' : 'text-muted-foreground/50')}>
            {display}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <CalendarPicker
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : null);
            setOpen(false);
          }}
          captionLayout="dropdown"
          fromYear={2000}
          toYear={2100}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
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
        className="flex h-full w-full items-center justify-center px-3 py-2 text-center text-sm"
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

/**
 * Multi-select cell. Like {@link SelectCell} but the value is an array of
 * option ids, rendered as multiple colored pills. The picker popover toggles
 * membership and stays open (Notion-style) so several options can be added in
 * one go; "Clear" empties the array.
 */
function MultiSelectCell({
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
  const selectedIds = Array.isArray(value) ? value : [];
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

  const toggle = (optId: string) => {
    onChange(
      selectedIds.includes(optId)
        ? selectedIds.filter((id) => id !== optId)
        : [...selectedIds, optId]
    );
  };

  // Render the selected pills in the order the options are declared, so a row's
  // pills stay stable regardless of the click order that built the set.
  const selectedOptions = options
    .map((o, i) => ({ opt: o, i }))
    .filter(({ opt }) => selectedIds.includes(opt.id));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${column.name}: ${
          selectedOptions.map(({ opt }) => opt.label).join(', ') || 'empty'
        }`}
        className="flex h-full w-full items-center justify-center px-3 py-2 text-center text-sm"
      >
        {selectedOptions.length > 0 ? (
          <span className="flex flex-wrap items-center justify-center gap-1">
            {selectedOptions.map(({ opt, i }) => {
              const c = resolveOptionColor(opt, i);
              return (
                <span
                  key={opt.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                    c.pill
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', c.swatch)} aria-hidden />
                  {opt.label}
                </span>
              );
            })}
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
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="hover:bg-muted/60 text-muted-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            {options.map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              const on = selectedIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  // Toggle without closing so multiple options can be added.
                  onClick={() => toggle(opt.id)}
                  aria-pressed={on}
                  className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70'
                    )}
                    aria-hidden
                  >
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
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
    case 'multiselect': {
      // Order by the first selected option's declared index; empty arrays sort
      // last. (Values are arrays here, so the null-guard above doesn't apply.)
      const opts = col.options ?? [];
      const first = (v: DatabaseCellValue) => (Array.isArray(v) && v.length ? v[0] : null);
      const fa = first(a);
      const fb = first(b);
      if (fa == null && fb == null) return 0;
      if (fa == null) return 1;
      if (fb == null) return -1;
      const ia = opts.findIndex((o) => o.id === fa);
      const ib = opts.findIndex((o) => o.id === fb);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    }
    case 'date':
    case 'text':
    default:
      return String(a).localeCompare(String(b));
  }
}

export function coerceValue(raw: DatabaseCellValue, type: DatabaseColumnType): DatabaseCellValue {
  if (raw == null) return type === 'checkbox' ? false : type === 'multiselect' ? [] : null;
  switch (type) {
    case 'text':
      // From a multiselect, join the raw option ids — we have no options table
      // here to resolve labels, but this keeps the data rather than "[object]".
      return Array.isArray(raw) ? raw.join(', ') : String(raw);
    case 'number': {
      const n = Number(Array.isArray(raw) ? raw[0] : raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
      return typeof raw === 'string' ? raw : null;
    case 'checkbox':
      return Array.isArray(raw) ? raw.length > 0 : Boolean(raw);
    case 'select':
      // From a multiselect, keep the first option; otherwise pass a string id.
      if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : null;
      return typeof raw === 'string' ? raw : null;
    case 'multiselect':
      if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
      return typeof raw === 'string' ? [raw] : [];
  }
}
