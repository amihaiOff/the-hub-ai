'use client';

import { AlignLeft, Plus } from 'lucide-react';
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
  onAddRow: (preset?: { colId: string; value: DatabaseCellValue }) => void;
  onOpenRow: (rowId: string) => void;
}

/**
 * Kanban view: one column per option of the board (kanban) select column
 * (empty option groups kept as drop targets, plus a trailing "No {col}" bucket
 * when populated). Each card shows the primary title, the Properties-selected
 * non-empty fields as compact chips, and a notes glyph. A per-column `+`
 * quick-adds a row preset to that column's value. Card drag-between-columns is
 * deferred to Phase 3.
 */
export function DbKanbanView({
  primaryCol,
  fieldCols,
  groups,
  kanbanColId,
  editable,
  onAddRow,
  onOpenRow,
}: DbKanbanViewProps) {
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
    <div className="flex gap-3 overflow-x-auto p-3">
      {groups.map((group) => (
        <div key={group.key} className="flex w-[248px] shrink-0 flex-col gap-2.5">
          <div className="flex items-center gap-2 px-0.5">
            {group.color ? (
              <SelectPill label={group.label} color={getSelectColor(group.color)} />
            ) : (
              <span className="text-muted-foreground bg-muted/40 inline-flex h-[20px] items-center rounded-[5px] px-1.5 text-[12px] font-medium">
                {group.label || 'No value'}
              </span>
            )}
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {group.rows.length}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() =>
                  onAddRow({ colId: kanbanColId, value: group.key === NO_GROUP ? null : group.key })
                }
                aria-label="Add card"
                className="text-muted-foreground/70 hover:text-foreground ml-auto flex h-5 w-5 items-center justify-center rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {group.rows.map((row) => {
            const chips = fieldCols.filter((c) => !isEmptyCellValue(row.cells[c.id] ?? null));
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onOpenRow(row.id)}
                className="border-border/70 bg-card/40 hover:border-border flex flex-col gap-2.5 rounded-xl border p-3 text-left transition-colors"
              >
                <div className="flex items-start gap-2">
                  <span className="text-foreground min-w-0 flex-1 text-[13.5px] leading-tight font-semibold">
                    {title(row)}
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
                        className={cn(
                          'inline-flex items-center',
                          col.type === 'number' && 'tabular-nums'
                        )}
                      >
                        <CellValueDisplay column={col} value={row.cells[col.id] ?? null} />
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
          {editable && (
            <button
              type="button"
              onClick={() =>
                onAddRow({ colId: kanbanColId, value: group.key === NO_GROUP ? null : group.key })
              }
              className="border-border/60 text-muted-foreground/70 hover:text-foreground hover:border-border rounded-xl border border-dashed py-2 text-center text-[12.5px] transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
