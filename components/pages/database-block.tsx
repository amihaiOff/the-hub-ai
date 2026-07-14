'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Baseline,
  Calendar,
  ChevronDown,
  Hash,
  ListChecks,
  Plus,
  SquareCheckBig,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  makeColumn,
  makeRow,
  makeSelectOption,
  type DatabaseCellValue,
  type DatabaseColumn,
  type DatabaseColumnType,
  type DatabaseRow,
} from './database-extension';

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
 * NodeView for the Notion-like "database" block. Renders a TanStack Table
 * with click-header sorting, per-column type controls, per-cell editors,
 * and hover-only add/delete affordances via floating edge tabs + leading
 * gutter. Persists edits by writing new `columns` / `rows` attributes back
 * to the ProseMirror node.
 */
export function DatabaseBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const columns = (node.attrs.columns ?? []) as DatabaseColumn[];
  const rows = (node.attrs.rows ?? []) as DatabaseRow[];

  const editable = editor.isEditable;

  const setColumns = (next: DatabaseColumn[]) => updateAttributes({ columns: next });
  const setRows = (next: DatabaseRow[]) => updateAttributes({ rows: next });

  const [sorting, setSorting] = useState<SortingState>([]);

  const columnHelper = useMemo(() => createColumnHelper<DatabaseRow>(), []);
  const tableColumns = useMemo(
    () =>
      columns.map((col) =>
        columnHelper.accessor((row) => row.cells[col.id], {
          id: col.id,
          header: () => col.name,
          sortingFn: (a, b, id) => sortByType(col, a.original.cells[id], b.original.cells[id]),
        })
      ),
    [columns, columnHelper]
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const updateCell = useCallback(
    (rowId: string, colId: string, value: DatabaseCellValue) => {
      setRows(
        rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r))
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  );

  const addRow = () => setRows([...rows, makeRow(columns)]);
  const deleteRow = (rowId: string) => setRows(rows.filter((r) => r.id !== rowId));

  const addColumn = () => {
    const col = makeColumn('New column', 'text');
    setColumns([...columns, col]);
    setRows(rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: null } })));
  };
  const deleteColumn = (colId: string) => {
    setColumns(columns.filter((c) => c.id !== colId));
    setRows(
      rows.map((r) => {
        const { [colId]: _dropped, ...rest } = r.cells;
        return { ...r, cells: rest };
      })
    );
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
  };
  const setSelectOptions = (
    colId: string,
    options: { id: string; label: string; color?: string }[]
  ) => {
    setColumns(columns.map((c) => (c.id === colId ? { ...c, options } : c)));
  };

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  return (
    <NodeViewWrapper as="div" className="database-block group/db relative my-4">
      <div
        ref={wrapperRef}
        className="border-border/40 bg-card/40 relative overflow-x-auto rounded-2xl border"
      >
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/40">
                {/* Leading gutter — matches the hover-only delete cell in the body. */}
                {editable && <th className="w-8 p-0" aria-hidden />}
                {headerGroup.headers.map((header) => {
                  const col = columns.find((c) => c.id === header.column.id);
                  if (!col) return null;
                  const sort = header.column.getIsSorted();
                  return (
                    <th key={header.id} className="min-w-[8rem] p-0">
                      <ColumnHeader
                        column={col}
                        sort={sort}
                        editable={editable}
                        onToggleSort={() => header.column.toggleSorting()}
                        onRename={(name) => renameColumn(col.id, name)}
                        onChangeType={(type) => changeColumnType(col.id, type)}
                        onDelete={() => deleteColumn(col.id)}
                        onSetOptions={(opts) => setSelectOptions(col.id, opts)}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((tableRow) => {
              const row = tableRow.original;
              return (
                <tr key={row.id} className="group/row">
                  {editable && (
                    <td className="w-8 p-0 align-middle">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        aria-label="Delete row"
                        title="Delete row"
                        className="text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive flex h-full w-full items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                  {tableRow.getVisibleCells().map((cell) => {
                    const col = columns.find((c) => c.id === cell.column.id);
                    if (!col) return null;
                    return (
                      <td key={cell.id} className="p-0 align-top">
                        <CellEditor
                          column={col}
                          value={row.cells[col.id]}
                          onChange={(v) => updateCell(row.id, col.id, v)}
                          editable={editable}
                        />
                      </td>
                    );
                  })}
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
          </tbody>
        </table>
      </div>

      {editable && (
        <>
          <button
            type="button"
            onClick={addColumn}
            aria-label="Add column"
            title="Add column"
            className="border-border/40 bg-background/70 text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 absolute top-0 -right-1 flex h-full w-5 items-center justify-center rounded-r-lg border border-l-0 opacity-0 backdrop-blur transition-opacity group-hover/db:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={addRow}
            aria-label="Add row"
            title="Add row"
            className="border-border/40 bg-background/70 text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 absolute -bottom-1 left-0 flex h-5 w-full items-center justify-center rounded-b-lg border border-t-0 opacity-0 backdrop-blur transition-opacity group-hover/db:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </NodeViewWrapper>
  );
}

// ─── Column header (name + sort + type/delete menu) ─────────────────────

function ColumnHeader({
  column,
  sort,
  editable,
  onToggleSort,
  onRename,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  sort: false | 'asc' | 'desc';
  editable: boolean;
  onToggleSort: () => void;
  onRename: (name: string) => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const menuOpen = menuAnchor !== null;
  const [name, setName] = useState(column.name);

  if (name !== column.name && document.activeElement?.getAttribute('data-col-id') !== column.id) {
    setName(column.name);
  }
  const typeMeta = TYPE_META[column.type];
  const TypeIcon = typeMeta.icon;

  return (
    <div className="group/header relative flex items-stretch">
      <button
        type="button"
        onClick={editable ? onToggleSort : undefined}
        title={sort ? `Sorted ${sort}` : 'Click to sort'}
        className="text-muted-foreground flex flex-1 items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold tracking-[0.08em] uppercase"
      >
        <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', typeMeta.color)} />
        {editable ? (
          <input
            data-col-id={column.id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name !== column.name) onRename(name.trim());
              else if (!name.trim()) setName(column.name);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setName(column.name);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-foreground/85 min-w-0 flex-1 bg-transparent tracking-[0.08em] uppercase outline-none"
          />
        ) : (
          <span className="text-foreground/85 min-w-0 flex-1 truncate">{column.name}</span>
        )}
        {sort === 'asc' && <ArrowUp className="text-primary h-3.5 w-3.5" />}
        {sort === 'desc' && <ArrowDown className="text-primary h-3.5 w-3.5" />}
        {editable && sort === false && (
          <ArrowUpDown className="text-muted-foreground/40 h-3 w-3 opacity-0 transition-opacity group-hover/header:opacity-100" />
        )}
      </button>
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor((cur) => (cur ? null : (e.currentTarget as HTMLButtonElement)));
          }}
          aria-label="Column options"
          className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 flex w-6 items-center justify-center opacity-0 transition-opacity group-hover/header:opacity-100"
        >
          <ChevronDown className="h-3.5 w-3.5" />
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
            {(column.options ?? []).map((opt) => {
              const c = getSelectColor(opt.color);
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

// ─── Cell editors ────────────────────────────────────────────────────────

function CellEditor({
  column,
  value,
  onChange,
  editable,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  editable: boolean;
}) {
  const disabled = !editable;
  switch (column.type) {
    case 'text':
      return (
        <input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
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
          className="w-full bg-transparent px-3 py-2 text-right text-sm tabular-nums outline-none"
        />
      );
    case 'date':
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className="text-muted-foreground w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
      );
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

  const selColor = selected ? getSelectColor(selected.color) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${column.name}: ${selected?.label ?? 'empty'}`}
        className="flex h-full w-full items-center px-3 py-2 text-left text-sm"
      >
        {selected && selColor ? (
          <span className={cn('rounded-md px-2 py-0.5 text-xs ring-1', selColor.pill)}>
            {selected.label}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs">Empty</span>
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
            {options.map((opt) => {
              const c = getSelectColor(opt.color);
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
