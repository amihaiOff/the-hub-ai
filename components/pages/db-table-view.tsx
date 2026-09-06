'use client';

import React, { useRef, useState } from 'react';
import { AlignLeft, ArrowUpRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseColumnType,
  DatabaseRow,
} from './database-extension';
import { columnWidth, type DbDensity, type RowGroup, NO_GROUP } from '@/lib/pages/db-view';
import { hasBodyContent } from '@/lib/pages/db-rows';
import { CellEditor, getSelectColor, SelectPill } from './db-cells';
import { ColumnHeader } from './db-column-header';

const MIN_WIDTH = 64;
const GUTTER_PX = 36;

interface DbTableViewProps {
  columns: DatabaseColumn[];
  visibleCols: DatabaseColumn[];
  groups: RowGroup[];
  grouped: boolean;
  density: DbDensity;
  editable: boolean;
  totalRowCount: number;
  hasActiveFilters: boolean;
  openRowId: string | null;
  autoEditColId: string | null;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
  onAddRow: (preset?: { colId: string; value: DatabaseCellValue }) => void;
  onDeleteRow: (rowId: string) => void;
  onOpenRow: (rowId: string) => void;
  onSetColumnWidth: (colId: string, width: number) => void;
  onRenameColumn: (colId: string, name: string) => void;
  onChangeColumnType: (colId: string, type: DatabaseColumnType) => void;
  onDeleteColumn: (colId: string) => void;
  onSetColumnOptions: (
    colId: string,
    opts: { id: string; label: string; color?: string }[]
  ) => void;
  /** The group column id (a select column), for quick-add presets. */
  groupColId: string | null;
}

/**
 * Table view for the database block. Renders grouped, filtered, sorted rows in a
 * horizontally-scrollable fixed-layout table with a sticky header, per-type
 * cells, drag-to-resize columns (mouse), a group-header quick-add, a hover
 * delete-row control, and a "New row" footer.
 */
export function DbTableView(props: DbTableViewProps) {
  const {
    visibleCols,
    groups,
    grouped,
    density,
    editable,
    totalRowCount,
    hasActiveFilters,
    openRowId,
    autoEditColId,
    onUpdateCell,
    onAddRow,
    onDeleteRow,
    onOpenRow,
    onSetColumnWidth,
    onRenameColumn,
    onChangeColumnType,
    onDeleteColumn,
    onSetColumnOptions,
    groupColId,
  } = props;

  // Live width override while dragging a column edge — committed on mouse-up so
  // we don't write an attribute on every pointer move.
  const [resizing, setResizing] = useState<{ colId: string; width: number } | null>(null);
  const resizeRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  const widthFor = (col: DatabaseColumn, index: number) =>
    resizing?.colId === col.id ? resizing.width : columnWidth(col, index);

  const startResize = (e: React.MouseEvent, col: DatabaseColumn, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidth(col, index);
    resizeRef.current = { colId: col.id, startX: e.clientX, startWidth };
    setResizing({ colId: col.id, width: startWidth });
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const width = Math.max(MIN_WIDTH, r.startWidth + (ev.clientX - r.startX));
      setResizing({ colId: r.colId, width });
    };
    const onUp = (ev: MouseEvent) => {
      const r = resizeRef.current;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      resizeRef.current = null;
      if (r) {
        const width = Math.max(MIN_WIDTH, r.startWidth + (ev.clientX - r.startX));
        onSetColumnWidth(r.colId, width);
      }
      setResizing(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const totalWidth =
    visibleCols.reduce((sum, col, i) => sum + widthFor(col, i), 0) + (editable ? GUTTER_PX : 0);
  const colCount = visibleCols.length + (editable ? 1 : 0);

  return (
    <div className="db-table-scroll relative">
      <table
        className={cn('text-sm', density === 'dense' ? 'db-dense' : 'db-airy')}
        style={{ tableLayout: 'fixed', width: `${Math.max(totalWidth, 100)}px`, minWidth: '100%' }}
      >
        <colgroup>
          {visibleCols.map((col, i) => (
            <col key={col.id} style={{ width: `${widthFor(col, i)}px` }} />
          ))}
          {editable && <col style={{ width: `${GUTTER_PX}px` }} />}
        </colgroup>
        <thead>
          <tr>
            {visibleCols.map((col, i) => (
              <th key={col.id} data-col-header-id={col.id} className="relative p-0">
                <ColumnHeader
                  column={col}
                  editable={editable}
                  autoStartEdit={autoEditColId === col.id}
                  onRename={(name) => onRenameColumn(col.id, name)}
                  onChangeType={(type) => onChangeColumnType(col.id, type)}
                  onDelete={() => onDeleteColumn(col.id)}
                  onSetOptions={(opts) => onSetColumnOptions(col.id, opts)}
                />
                {editable && (
                  <span
                    role="separator"
                    aria-label={`Resize ${col.name}`}
                    onMouseDown={(e) => startResize(e, col, i)}
                    className="group/rz absolute top-0 right-[-4px] bottom-0 z-10 w-2 cursor-col-resize"
                  >
                    <span className="bg-primary/50 absolute top-2 right-1 bottom-2 w-0.5 rounded-full opacity-0 transition-opacity group-hover/rz:opacity-100" />
                  </span>
                )}
              </th>
            ))}
            {editable && <th aria-hidden className="p-0" />}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <React.Fragment key={group.key}>
              {grouped && (
                <GroupHeaderRow
                  group={group}
                  colSpan={colCount}
                  density={density}
                  editable={editable}
                  onQuickAdd={() =>
                    onAddRow(
                      groupColId
                        ? { colId: groupColId, value: group.key === NO_GROUP ? null : group.key }
                        : undefined
                    )
                  }
                />
              )}
              {group.rows.map((row) => (
                <TableRow
                  key={row.id}
                  row={row}
                  visibleCols={visibleCols}
                  editable={editable}
                  open={openRowId === row.id}
                  onUpdateCell={onUpdateCell}
                  onOpenRow={onOpenRow}
                  onDeleteRow={onDeleteRow}
                />
              ))}
            </React.Fragment>
          ))}
          {totalRowCount === 0 && (
            <tr>
              <td colSpan={colCount} className="text-muted-foreground py-4 text-center text-xs">
                {editable ? 'No rows yet.' : 'Empty'}
              </td>
            </tr>
          )}
          {hasActiveFilters && totalRowCount > 0 && groups.every((g) => g.rows.length === 0) && (
            <tr>
              <td colSpan={colCount} className="text-muted-foreground py-4 text-center text-xs">
                No rows match the filter.
              </td>
            </tr>
          )}
          {editable && (
            <tr data-add-row="">
              <td colSpan={colCount} className="p-0">
                <button
                  type="button"
                  onClick={() => onAddRow()}
                  aria-label="Add row"
                  className="text-muted-foreground/70 hover:text-foreground hover:bg-muted/30 flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[13px] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> New row
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupHeaderRow({
  group,
  colSpan,
  density,
  editable,
  onQuickAdd,
}: {
  group: RowGroup;
  colSpan: number;
  density: DbDensity;
  editable: boolean;
  onQuickAdd: () => void;
}) {
  return (
    <tr data-group-header="">
      <td colSpan={colSpan} className="p-0">
        <div
          className={cn(
            'flex items-center gap-2.5',
            density === 'dense' ? 'px-3 pt-2.5 pb-1.5' : 'px-3.5 pt-4 pb-2'
          )}
        >
          {group.color ? (
            <SelectPill label={group.label} color={getSelectColor(group.color)} />
          ) : (
            <span className="text-muted-foreground bg-muted/40 inline-flex h-[20px] items-center rounded-[5px] px-1.5 text-[12px] font-medium">
              {group.label || 'No value'}
            </span>
          )}
          <span className="text-muted-foreground text-[11px] tabular-nums">{group.rows.length}</span>
          {editable && (
            <button
              type="button"
              onClick={onQuickAdd}
              aria-label="Add row to group"
              className="text-muted-foreground/70 hover:text-foreground ml-1 flex h-5 w-5 items-center justify-center rounded transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TableRow({
  row,
  visibleCols,
  editable,
  open,
  onUpdateCell,
  onOpenRow,
  onDeleteRow,
}: {
  row: DatabaseRow;
  visibleCols: DatabaseColumn[];
  editable: boolean;
  open: boolean;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
  onOpenRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
}) {
  const rowHasBody = hasBodyContent(row.body);
  return (
    <tr className={cn('group/row', open && 'db-row-open')} data-row-id={row.id}>
      {visibleCols.map((col, cellIdx) => {
        const isPrimary = cellIdx === 0;
        const cellEditor = (
          <CellEditor
            column={col}
            value={row.cells[col.id]}
            onChange={(v) => onUpdateCell(row.id, col.id, v)}
            editable={editable}
            isPrimary={isPrimary}
          />
        );
        return (
          <td
            key={col.id}
            className={cn('p-0 align-top', col.type === 'number' && 'text-right')}
          >
            {isPrimary ? (
              <div className="flex items-center">
                <GripVertical
                  aria-hidden
                  className="text-muted-foreground/40 ml-1 h-3.5 w-3 shrink-0 opacity-0 group-hover/row:opacity-40"
                />
                <div className="min-w-0 flex-1">{cellEditor}</div>
                {rowHasBody && (
                  <AlignLeft
                    aria-label="Row has notes"
                    className="text-muted-foreground/50 ml-3 h-3 w-3 shrink-0"
                  />
                )}
                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRow(row.id);
                  }}
                  aria-label="Open entry"
                  title="Open entry"
                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs opacity-0 transition-opacity group-hover/row:opacity-100"
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
      {editable && (
        <td className="p-0 align-middle">
          <button
            type="button"
            onClick={() => onDeleteRow(row.id)}
            aria-label="Delete row"
            title="Delete row"
            className="text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive mx-auto flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}
