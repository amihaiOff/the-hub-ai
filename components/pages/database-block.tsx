'use client';

import { useCallback, useMemo, useState } from 'react';
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
  // Tint the header type icon so the column type is legible at a glance.
  text: { label: 'Text', icon: Baseline, color: 'text-slate-400' },
  number: { label: 'Number', icon: Hash, color: 'text-blue-400' },
  date: { label: 'Date', icon: Calendar, color: 'text-emerald-400' },
  select: { label: 'Select', icon: ListChecks, color: 'text-violet-400' },
  checkbox: { label: 'Checkbox', icon: SquareCheckBig, color: 'text-amber-400' },
};

/**
 * NodeView for the Notion-like "database" block. Renders a TanStack Table
 * with click-header sorting, per-column type controls, per-cell editors
 * keyed on the column's type, and add/delete affordances for rows and
 * columns. Persists edits by writing new `columns` / `rows` attribute
 * values back to the ProseMirror node.
 */
export function DatabaseBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  // Fall back to empty arrays so an incompletely-parsed node never crashes
  // — the insert command always seeds both attributes so this is defensive.
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
    // rows is captured by closure; setRows depends on updateAttributes
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
        // Strip the removed column's value from every row.
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
        // Ensure `select` columns always have an options array.
        if (type === 'select' && !next.options) next.options = [];
        if (type !== 'select') delete next.options;
        return next;
      })
    );
    // Coerce existing values so a type change doesn't leave garbage that
    // won't render (e.g. leaving a string in a checkbox column).
    setRows(
      rows.map((r) => {
        const raw = r.cells[colId];
        return { ...r, cells: { ...r.cells, [colId]: coerceValue(raw, type) } };
      })
    );
  };
  const setSelectOptions = (colId: string, options: { id: string; label: string }[]) => {
    setColumns(columns.map((c) => (c.id === colId ? { ...c, options } : c)));
  };

  return (
    <NodeViewWrapper as="div" className="database-block my-4">
      <div className="border-border/40 bg-card/40 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-muted/40">
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
                {editable && (
                  <th className="w-10 p-0">
                    <button
                      type="button"
                      onClick={addColumn}
                      aria-label="Add column"
                      title="Add column"
                      className="text-muted-foreground/70 hover:bg-muted/70 hover:text-foreground flex h-full w-full items-center justify-center"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((tableRow) => {
              const row = tableRow.original;
              return (
                <tr key={row.id} className="group">
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
                  {editable && (
                    <td className="w-10 p-0 align-middle">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        aria-label="Delete row"
                        title="Delete row"
                        className="text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive flex h-full w-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {editable && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="text-muted-foreground/70 hover:text-foreground p-0"
                >
                  <button
                    type="button"
                    onClick={addRow}
                    aria-label="Add row"
                    className="hover:bg-muted/40 flex h-8 w-full items-center gap-2 pl-3 text-left text-xs transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> New row
                  </button>
                </td>
              </tr>
            )}
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
  onSetOptions: (opts: { id: string; label: string }[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(column.name);
  // Keep local input in sync when the underlying column name changes elsewhere.
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
            setMenuOpen((o) => !o);
          }}
          aria-label="Column options"
          className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 flex w-6 items-center justify-center opacity-0 transition-opacity group-hover/header:opacity-100"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {menuOpen && (
        <ColumnMenu
          column={column}
          onClose={() => setMenuOpen(false)}
          onChangeType={onChangeType}
          onDelete={onDelete}
          onSetOptions={onSetOptions}
        />
      )}
    </div>
  );
}

function ColumnMenu({
  column,
  onClose,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  onClose: () => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string }[]) => void;
}) {
  const [newOption, setNewOption] = useState('');
  return (
    <div
      role="menu"
      className="bg-popover text-popover-foreground absolute top-full right-0 z-50 mt-1 w-56 rounded-xl border p-1 shadow-xl"
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
              onClose();
            }}
            className={cn(
              'hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
              column.type === t && 'bg-muted/50 font-medium'
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {TYPE_META[t].label}
          </button>
        );
      })}

      {column.type === 'select' && (
        <div className="border-border/50 mt-1 border-t pt-1">
          <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
            Options
          </p>
          <div className="space-y-1 px-1 pb-1">
            {(column.options ?? []).map((opt) => (
              <div key={opt.id} className="flex items-center gap-1">
                <span className="bg-muted/60 flex-1 truncate rounded-md px-2 py-1 text-xs">
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
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const label = newOption.trim();
                if (!label) return;
                onSetOptions([...(column.options ?? []), makeSelectOption(label)]);
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
    case 'select': {
      const options = column.options ?? [];
      const selectedId = typeof value === 'string' ? value : '';
      const selectedLabel = options.find((o) => o.id === selectedId)?.label ?? '';
      return (
        <select
          value={selectedId}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
          aria-label={`${column.name}: ${selectedLabel || 'empty'}`}
        >
          <option value=""></option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
  }
}

// ─── Sort + type coercion helpers ────────────────────────────────────────

function sortByType(col: DatabaseColumn, a: DatabaseCellValue, b: DatabaseCellValue): number {
  // Nulls sort last regardless of direction — TanStack flips sign for desc.
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
      // Options in the column's declared order — matches how the header menu lists them.
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
