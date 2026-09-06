'use client';

import React from 'react';
import { AlignLeft, Plus } from 'lucide-react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from './database-extension';
import { type RowGroup, NO_GROUP } from '@/lib/pages/db-view';
import { hasBodyContent } from '@/lib/pages/db-rows';
import { CellValueDisplay, getSelectColor, isEmptyCellValue, SelectPill } from './db-cells';

interface DbKanbanViewProps {
  primaryCol: DatabaseColumn | null;
  fieldCols: DatabaseColumn[];
  groups: RowGroup[];
  kanbanColId: string | null;
  editable: boolean;
  /**
   * True while a sort is active — the visible card order is derived, so a
   * within-column reorder can't stick (it would snap back). Cross-column drag
   * still reclassifies, which is meaningful regardless of sort.
   */
  sortActive: boolean;
  onAddRow: (preset?: { colId: string; value: DatabaseCellValue }) => void;
  onOpenRow: (rowId: string) => void;
  /**
   * Cross-column / within-column drag: reclassify the card's board-select value
   * to `targetValue` (null for the "No {col}" bucket) and position it near
   * `overId` (or append when dropped on empty column space, overId null).
   */
  onMoveRowToGroup: (activeId: string, targetValue: string | null, overId: string | null) => void;
}

// Column droppable ids are namespaced so a drop on empty column space is
// distinguishable from a drop onto a card (whose id is the raw row id).
const COL_PREFIX = 'kcol:';

/**
 * Kanban view: one column per option of the board (kanban) select column
 * (empty option groups kept as drop targets, plus a trailing "No {col}" bucket
 * when populated). Each card shows the primary title, the Properties-selected
 * non-empty fields as compact chips, and a notes glyph. A per-column `+`
 * quick-adds a row preset to that column's value. Cards drag between columns
 * (reclassifying the board value) and reorder within a column via dnd-kit.
 */
export function DbKanbanView({
  primaryCol,
  fieldCols,
  groups,
  kanbanColId,
  editable,
  sortActive,
  onAddRow,
  onOpenRow,
  onMoveRowToGroup,
}: DbKanbanViewProps) {
  // Split by input type so vertical scrolls on mobile don't accidentally pick a
  // card up: mouse drags start after a small move; touch drags require a hold so
  // a scroll gesture has room to be read as a scroll (and tap-to-open survives).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );

  // rowId → group key, to resolve the target column when a card is dropped onto
  // another card (over.id is a raw row id in that case).
  const rowGroupKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const r of g.rows) m.set(r.id, g.key);
    return m;
  }, [groups]);

  const handleDragEnd = (e: DragEndEvent) => {
    if (!editable) return;
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    let targetKey: string;
    let overRowId: string | null;
    if (overId.startsWith(COL_PREFIX)) {
      // Dropped on empty column space → append within that column.
      targetKey = overId.slice(COL_PREFIX.length);
      overRowId = null;
    } else {
      // Dropped onto a card → adopt that card's column and land at its slot.
      const key = rowGroupKey.get(overId);
      if (key === undefined) return;
      targetKey = key;
      overRowId = overId;
    }
    if (overRowId === activeId) return;
    // Under an active sort the card order is derived, so a within-column move
    // (target column === the card's current column) would immediately snap back
    // and burn a doc write. Cross-column drops still reclassify, so allow those.
    if (sortActive && rowGroupKey.get(activeId) === targetKey) return;
    onMoveRowToGroup(activeId, targetKey === NO_GROUP ? null : targetKey, overRowId);
  };

  if (!kanbanColId) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Add a Select column, then choose it under Group to build a board.
      </p>
    );
  }

  const title = (row: DatabaseRow): string => {
    if (!primaryCol) return 'Untitled';
    const v = row.cells[primaryCol.id];
    return typeof v === 'string' && v.trim() ? v : 'Untitled';
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto p-3">
        {groups.map((group) => (
          <KanbanColumn
            key={group.key}
            group={group}
            kanbanColId={kanbanColId}
            fieldCols={fieldCols}
            editable={editable}
            titleOf={title}
            onAddRow={onAddRow}
            onOpenRow={onOpenRow}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  group,
  kanbanColId,
  fieldCols,
  editable,
  titleOf,
  onAddRow,
  onOpenRow,
}: {
  group: RowGroup;
  kanbanColId: string;
  fieldCols: DatabaseColumn[];
  editable: boolean;
  titleOf: (row: DatabaseRow) => string;
  onAddRow: (preset?: { colId: string; value: DatabaseCellValue }) => void;
  onOpenRow: (rowId: string) => void;
}) {
  const presetValue = group.key === NO_GROUP ? null : group.key;
  // The whole card area is the drop target so a card can land on an empty
  // column or below the last card.
  const { setNodeRef, isOver } = useDroppable({ id: COL_PREFIX + group.key });

  return (
    <div className="flex w-[248px] shrink-0 flex-col gap-2.5">
      <div className="flex items-center gap-2 px-0.5">
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
            onClick={() => onAddRow({ colId: kanbanColId, value: presetValue })}
            aria-label="Add card"
            className="text-muted-foreground/70 hover:text-foreground ml-auto flex h-5 w-5 items-center justify-center rounded transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <SortableContext items={group.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-16 flex-col gap-2.5 rounded-xl transition-colors',
            isOver && 'bg-primary/5 outline-primary/40 outline-2 outline-dashed'
          )}
        >
          {group.rows.map((row) => (
            <KanbanCard
              key={row.id}
              row={row}
              fieldCols={fieldCols}
              editable={editable}
              title={titleOf(row)}
              onOpenRow={onOpenRow}
            />
          ))}
        </div>
      </SortableContext>
      {editable && (
        <button
          type="button"
          onClick={() => onAddRow({ colId: kanbanColId, value: presetValue })}
          className="border-border/60 text-muted-foreground/70 hover:text-foreground hover:border-border rounded-xl border border-dashed py-2 text-center text-[12.5px] transition-colors"
        >
          + Add
        </button>
      )}
    </div>
  );
}

function KanbanCard({
  row,
  fieldCols,
  editable,
  title,
  onOpenRow,
}: {
  row: DatabaseRow;
  fieldCols: DatabaseColumn[];
  editable: boolean;
  title: string;
  onOpenRow: (rowId: string) => void;
}) {
  const chips = fieldCols.filter((c) => !isEmptyCellValue(row.cells[c.id] ?? null));
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !editable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Keep native vertical scroll on touch (dnd-kit sets touch-action:none on
    // the node otherwise); the TouchSensor delay still activates a drag on hold.
    touchAction: 'pan-y',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => {
        // A real drag fires no click (activation distance 6 / hold delay).
        if (isDragging) return;
        onOpenRow(row.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenRow(row.id);
        }
      }}
      className={cn(
        'border-border/70 bg-card/40 hover:border-border flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-colors select-none',
        editable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-60 shadow-lg'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-foreground min-w-0 flex-1 text-[13.5px] leading-tight font-semibold">
          {title}
        </span>
        {hasBodyContent(row.body) && (
          <AlignLeft className="text-muted-foreground/60 mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
      </div>
      {chips.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[12px]">
          {chips.map((col) => (
            <span
              key={col.id}
              className={cn('inline-flex items-center', col.type === 'number' && 'tabular-nums')}
            >
              <CellValueDisplay column={col} value={row.cells[col.id] ?? null} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
