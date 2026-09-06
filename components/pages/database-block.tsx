'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  applyFilters,
  groupRows,
  groupableColumns,
  resolveViewConfig,
  sortRows,
  visibleColumns,
  type DbView,
  type ViewConfig,
} from '@/lib/pages/db-view';
import { isColumnFilterActive, seedValueForFilter, type ColumnFilter } from './db-filter';
import { primaryColumn, setRowBody } from '@/lib/pages/db-rows';
import { coerceValue } from './db-cells';
import { DatabaseEntrySheet } from './database-entry-sheet';
import { DbToolbar } from './db-toolbar';
import { DbTableView } from './db-table-view';
import { DbCardsView } from './db-cards-view';
import { DbKanbanView } from './db-kanban-view';
import {
  makeColumn,
  makeRow,
  newId,
  type DatabaseCellValue,
  type DatabaseColumn,
  type DatabaseColumnType,
  type DatabaseRow,
} from './database-extension';

/**
 * Re-exported for the coerce-value unit test (which imports from this module)
 * and any legacy callers. The implementation lives in `db-cells`.
 */
export { coerceValue, getSelectColor, resolveOptionColor, SELECT_COLORS } from './db-cells';

/** Per-viewer collapse state (localStorage, keyed by block id). */
const COLLAPSE_PREFIX = 'hubai:db-collapsed:';

/**
 * NodeView for the Areas "database" block (v2). Renders a collapsible toolbar
 * over one of three views (Table / Cards / Kanban), all driven by the pure
 * engine in `lib/pages/db-view`. Shared view state (view, density, group/kanban
 * column, sort, filters, per-view hidden columns, card options) persists on the
 * node's `viewConfig` attribute; column widths persist on the columns array.
 * Collapse is per-viewer (localStorage). Read-only viewers can still switch
 * views / sort / filter locally (ephemeral) but never mutate the document.
 */
export function DatabaseBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const columns = useMemo(
    () => (node.attrs.columns ?? []) as DatabaseColumn[],
    [node.attrs.columns]
  );
  const rows = useMemo(() => (node.attrs.rows ?? []) as DatabaseRow[], [node.attrs.rows]);
  const title = (node.attrs.title as string | null) ?? '';
  const editable = editor.isEditable;

  // Always-fresh refs for DEFERRED / multi-write handlers so a callback that
  // closed over a render-time snapshot can't clobber an interleaved edit.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Resolved, effective view config. Editable users read/write the persisted
  // `viewConfig` attribute; read-only viewers get an ephemeral local override so
  // they can drive the views without mutating the shared document.
  const persistedConfig = useMemo(
    () => resolveViewConfig(node.attrs.viewConfig),
    [node.attrs.viewConfig]
  );
  const [localConfig, setLocalConfig] = useState<ViewConfig | null>(null);
  const config = editable ? persistedConfig : (localConfig ?? persistedConfig);
  const configRef = useRef(config);
  configRef.current = config;

  const patchConfig = useCallback(
    (patch: Partial<ViewConfig>) => {
      const next = { ...configRef.current, ...patch };
      if (editable) updateAttributes({ viewConfig: next });
      else setLocalConfig(next);
    },
    [editable, updateAttributes]
  );

  const setColumns = useCallback(
    (next: DatabaseColumn[]) => updateAttributes({ columns: next }),
    [updateAttributes]
  );
  const setRows = useCallback(
    (next: DatabaseRow[]) => updateAttributes({ rows: next }),
    [updateAttributes]
  );

  // Stable block id — keys per-viewer collapse state. Legacy blocks predate the
  // attribute; backfill one on first mount (editable only).
  const blockId = (node.attrs.id ?? null) as string | null;
  useEffect(() => {
    if (!blockId && editable) updateAttributes({ id: newId('dbb') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!blockId || typeof window === 'undefined') return;
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_PREFIX + blockId) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [blockId]);
  const toggleCollapse = () =>
    setCollapsed((c) => {
      const next = !c;
      if (blockId && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(COLLAPSE_PREFIX + blockId, next ? '1' : '0');
        } catch {
          /* best-effort */
        }
      }
      return next;
    });

  const [confirmDeleteCol, setConfirmDeleteCol] = useState<{ id: string; name: string } | null>(
    null
  );
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [autoEditColId, setAutoEditColId] = useState<string | null>(null);

  // ── Grouping / board column resolution ──────────────────────────────────
  const groupableCols = useMemo(() => groupableColumns(columns), [columns]);
  const primaryCol = primaryColumn(columns);
  const primaryColId = primaryCol?.id ?? null;
  const isKanban = config.view === 'kanban';
  const firstGroupable = groupableCols[0]?.id ?? null;
  const kanbanColId = config.kanbanBy ?? firstGroupable;
  const tableGroupColId =
    config.groupBy && groupableCols.some((c) => c.id === config.groupBy) ? config.groupBy : null;
  // The column the toolbar's Group control targets for the current view.
  const groupColId = isKanban ? kanbanColId : tableGroupColId;
  const onGroupChange = useCallback(
    (id: string | null) => patchConfig(isKanban ? { kanbanBy: id } : { groupBy: id }),
    [isKanban, patchConfig]
  );

  // ── Filters ─────────────────────────────────────────────────────────────
  const filters = config.filters;
  // Compute from existing columns (not raw filter values) so a filter left over
  // from a column removed out-of-band can't falsely show "no rows match" —
  // applyFilters ignores such orphans too (it iterates columns).
  const hasActiveFilters = columns.some((c) => {
    const f = filters[c.id];
    return !!f && isColumnFilterActive(f);
  });
  const onFilterChange = useCallback(
    (colId: string, next: ColumnFilter) => {
      const f = { ...configRef.current.filters };
      if (isColumnFilterActive(next)) f[colId] = next;
      else delete f[colId];
      patchConfig({ filters: f });
    },
    [patchConfig]
  );
  const onClearFilters = useCallback(() => patchConfig({ filters: {} }), [patchConfig]);

  // ── Hidden columns (per view) ───────────────────────────────────────────
  const toggleHidden = useCallback(
    (colId: string) => {
      const c = configRef.current;
      const set = new Set(c.hidden[c.view]);
      if (set.has(colId)) set.delete(colId);
      else set.add(colId);
      patchConfig({ hidden: { ...c.hidden, [c.view]: Array.from(set) } });
    },
    [patchConfig]
  );
  const showAllColumns = useCallback(() => {
    const c = configRef.current;
    patchConfig({ hidden: { ...c.hidden, [c.view]: [] } });
  }, [patchConfig]);

  // ── Row mutations ───────────────────────────────────────────────────────
  const updateCell = useCallback(
    (rowId: string, colId: string, value: DatabaseCellValue) => {
      setRows(
        rowsRef.current.map((r) =>
          r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
        )
      );
    },
    [setRows]
  );
  const updateRowBody = useCallback(
    (rowId: string, body: unknown) => setRows(setRowBody(rowsRef.current, rowId, body)),
    [setRows]
  );
  const addRow = useCallback(
    (preset?: { colId: string; value: DatabaseCellValue }) => {
      const row = makeRow(columnsRef.current);
      // Seed any active filter so the new row stays visible instead of being
      // hidden the moment it's created (an empty cell fails every filter).
      for (const col of columnsRef.current) {
        const f = configRef.current.filters[col.id];
        if (f && isColumnFilterActive(f)) {
          const seed = seedValueForFilter(f);
          if (seed !== undefined) row.cells[col.id] = seed;
        }
      }
      if (preset) row.cells[preset.colId] = preset.value;
      setRows([...rowsRef.current, row]);
    },
    [setRows]
  );
  const deleteRow = useCallback(
    (rowId: string) => {
      setRows(rowsRef.current.filter((r) => r.id !== rowId));
      setOpenRowId((cur) => (cur === rowId ? null : cur));
    },
    [setRows]
  );

  // ── Column mutations ────────────────────────────────────────────────────
  const addColumn = useCallback(() => {
    const col = makeColumn('New column', 'text');
    setColumns([...columnsRef.current, col]);
    setRows(rowsRef.current.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: null } })));
    setAutoEditColId(col.id);
  }, [setColumns, setRows]);
  useEffect(() => {
    if (!autoEditColId) return;
    const t = setTimeout(() => setAutoEditColId(null), 600);
    return () => clearTimeout(t);
  }, [autoEditColId]);

  const setColumnWidth = useCallback(
    (colId: string, width: number) => {
      setColumns(columnsRef.current.map((c) => (c.id === colId ? { ...c, width } : c)));
    },
    [setColumns]
  );
  const renameColumn = useCallback(
    (colId: string, name: string) => {
      setColumns(columnsRef.current.map((c) => (c.id === colId ? { ...c, name } : c)));
    },
    [setColumns]
  );
  const changeColumnType = useCallback(
    (colId: string, type: DatabaseColumnType) => {
      setColumns(
        columnsRef.current.map((c) => {
          if (c.id !== colId) return c;
          const next: DatabaseColumn = { ...c, type };
          const hasOptions = type === 'select' || type === 'multiselect';
          if (hasOptions && !next.options) next.options = [];
          if (!hasOptions) delete next.options;
          return next;
        })
      );
      setRows(
        rowsRef.current.map((r) => ({
          ...r,
          cells: { ...r.cells, [colId]: coerceValue(r.cells[colId] ?? null, type) },
        }))
      );
      // Drop the (now type-mismatched) filter for this column.
      const f = { ...configRef.current.filters };
      if (f[colId]) {
        delete f[colId];
        patchConfig({ filters: f });
      }
    },
    [setColumns, setRows, patchConfig]
  );
  const setColumnOptions = useCallback(
    (colId: string, options: { id: string; label: string; color?: string }[]) => {
      setColumns(columnsRef.current.map((c) => (c.id === colId ? { ...c, options } : c)));
    },
    [setColumns]
  );
  const performDeleteColumn = useCallback(
    (colId: string) => {
      setColumns(columnsRef.current.filter((c) => c.id !== colId));
      setRows(
        rowsRef.current.map((r) => {
          const rest = { ...r.cells };
          delete rest[colId];
          return { ...r, cells: rest };
        })
      );
      // Scrub any config references to the deleted column.
      const c = configRef.current;
      const patch: Partial<ViewConfig> = {};
      if (c.filters[colId]) {
        const f = { ...c.filters };
        delete f[colId];
        patch.filters = f;
      }
      if (c.groupBy === colId) patch.groupBy = null;
      if (c.kanbanBy === colId) patch.kanbanBy = null;
      if (c.sort?.columnId === colId) patch.sort = null;
      patch.hidden = {
        table: c.hidden.table.filter((x) => x !== colId),
        cards: c.hidden.cards.filter((x) => x !== colId),
        kanban: c.hidden.kanban.filter((x) => x !== colId),
      };
      patchConfig(patch);
    },
    [setColumns, setRows, patchConfig]
  );
  const requestDeleteColumn = useCallback(
    (colId: string) => {
      const col = columnsRef.current.find((c) => c.id === colId);
      setConfirmDeleteCol({ id: colId, name: col?.name ?? 'this column' });
    },
    []
  );

  // ── Derived display (filter → sort → group) ─────────────────────────────
  const filtered = useMemo(() => applyFilters(rows, columns, filters), [rows, columns, filters]);
  const sorted = useMemo(
    () => sortRows(filtered, columns, config.sort),
    [filtered, columns, config.sort]
  );
  const view: DbView = config.view;
  const visibleForView = useMemo(
    () => visibleColumns(columns, config, view),
    [columns, config, view]
  );
  const fieldCols = useMemo(
    () => visibleForView.filter((c) => c.id !== primaryColId),
    [visibleForView, primaryColId]
  );
  const tableGroups = useMemo(
    () => groupRows(sorted, columns, tableGroupColId, { includeEmpty: false }),
    [sorted, columns, tableGroupColId]
  );
  const kanbanGroups = useMemo(
    () => groupRows(sorted, columns, kanbanColId, { includeEmpty: true }),
    [sorted, columns, kanbanColId]
  );

  const openRow = openRowId ? (rows.find((r) => r.id === openRowId) ?? null) : null;

  return (
    <NodeViewWrapper as="div" className="database-block group/db relative my-4">
      <DbToolbar
        editable={editable}
        title={title}
        onTitleChange={(t) => updateAttributes({ title: t })}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        view={view}
        onViewChange={(v) => patchConfig({ view: v })}
        density={config.density}
        onDensityChange={(d) => patchConfig({ density: d })}
        columns={columns}
        primaryColId={primaryColId}
        groupableCols={groupableCols}
        groupColId={groupColId}
        onGroupChange={onGroupChange}
        sort={config.sort}
        onSortChange={(s) => patchConfig({ sort: s })}
        filters={filters}
        onFilterChange={onFilterChange}
        onClearFilters={onClearFilters}
        hidden={config.hidden[view]}
        onToggleHidden={toggleHidden}
        onShowAll={showAllColumns}
        hideEmptyCardFields={config.hideEmptyCardFields}
        onHideEmptyChange={(v) => patchConfig({ hideEmptyCardFields: v })}
        onAddColumn={addColumn}
      />

      {!collapsed && columns.length > 0 && (
        <>
          {view === 'table' && (
            <div className="db-frame mt-2">
              <DbTableView
                columns={columns}
                visibleCols={visibleForView}
                groups={tableGroups}
                grouped={!!tableGroupColId}
                density={config.density}
                editable={editable}
                totalRowCount={rows.length}
                hasActiveFilters={hasActiveFilters}
                openRowId={openRowId}
                autoEditColId={autoEditColId}
                onUpdateCell={updateCell}
                onAddRow={addRow}
                onDeleteRow={deleteRow}
                onOpenRow={setOpenRowId}
                onSetColumnWidth={setColumnWidth}
                onRenameColumn={renameColumn}
                onChangeColumnType={changeColumnType}
                onDeleteColumn={requestDeleteColumn}
                onSetColumnOptions={setColumnOptions}
                groupColId={tableGroupColId}
              />
            </div>
          )}
          {view === 'cards' && (
            <div className="mt-1">
              <DbCardsView
                primaryCol={primaryCol}
                fieldCols={fieldCols}
                rows={sorted}
                editable={editable}
                hideEmptyCardFields={config.hideEmptyCardFields}
                hasActiveFilters={hasActiveFilters}
                totalRowCount={rows.length}
                onOpenRow={setOpenRowId}
                onUpdateCell={updateCell}
              />
            </div>
          )}
          {view === 'kanban' && (
            <div className="mt-1">
              <DbKanbanView
                primaryCol={primaryCol}
                fieldCols={fieldCols}
                groups={kanbanGroups}
                kanbanColId={kanbanColId}
                editable={editable}
                onAddRow={addRow}
                onOpenRow={setOpenRowId}
              />
            </div>
          )}
        </>
      )}

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
    </NodeViewWrapper>
  );
}
