'use client';

import { useState } from 'react';
import { AlignLeft, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DatabaseCellValue, DatabaseColumn, DatabaseRow } from './database-extension';
import { hasBodyContent } from '@/lib/pages/db-rows';
import { CellEditor, isEmptyCellValue } from './db-cells';
import { useLongPress } from '@/lib/hooks/use-long-press';

interface DbCardsViewProps {
  primaryCol: DatabaseColumn | null;
  fieldCols: DatabaseColumn[];
  rows: DatabaseRow[];
  editable: boolean;
  hideEmptyCardFields: boolean;
  hasActiveFilters: boolean;
  totalRowCount: number;
  onOpenRow: (rowId: string) => void;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
}

/**
 * Cards view: a responsive grid where each row is a card. The primary column is
 * the hero title and the Properties-selected columns render as editable
 * `label: value` fields — you edit cells inline right in the card (empty fields
 * optionally hidden). Long-press a card (or the hover "open" button on desktop)
 * to open the row's full page; a plain tap edits the field you touched. Cards
 * collapse to title-only individually or all at once. Per-card collapse is
 * ephemeral (per-viewer).
 */
export function DbCardsView({
  primaryCol,
  fieldCols,
  rows,
  editable,
  hideEmptyCardFields,
  hasActiveFilters,
  totalRowCount,
  onOpenRow,
  onUpdateCell,
}: DbCardsViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {hasActiveFilters && totalRowCount > 0 ? 'No rows match the filter.' : 'No rows yet.'}
      </p>
    );
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(new Set(rows.map((r) => r.id)))}
          className="border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground rounded-lg border px-2.5 py-1 text-xs transition-colors"
        >
          Collapse all
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground rounded-lg border px-2.5 py-1 text-xs transition-colors"
        >
          Expand all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <CardItem
            key={row.id}
            row={row}
            primaryCol={primaryCol}
            fieldCols={fieldCols}
            editable={editable}
            hideEmptyCardFields={hideEmptyCardFields}
            isCollapsed={collapsed.has(row.id)}
            onToggle={() => toggle(row.id)}
            onOpenRow={onOpenRow}
            onUpdateCell={onUpdateCell}
          />
        ))}
      </div>
    </div>
  );
}

function CardItem({
  row,
  primaryCol,
  fieldCols,
  editable,
  hideEmptyCardFields,
  isCollapsed,
  onToggle,
  onOpenRow,
  onUpdateCell,
}: {
  row: DatabaseRow;
  primaryCol: DatabaseColumn | null;
  fieldCols: DatabaseColumn[];
  editable: boolean;
  hideEmptyCardFields: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenRow: (rowId: string) => void;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
}) {
  // Long-press the card opens its page; a plain tap edits the field touched.
  const { bindRef, consumedClick } = useLongPress(() => onOpenRow(row.id), {
    delay: 450,
    moveTolerance: 8,
  });
  const shownFields = fieldCols.filter(
    (c) => !hideEmptyCardFields || !isEmptyCellValue(row.cells[c.id] ?? null)
  );

  return (
    <div
      ref={bindRef}
      className="border-border bg-card shadow-glow-sm group/card relative flex flex-col gap-3 rounded-2xl border p-3.5"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isCollapsed ? 'Expand card' : 'Collapse card'}
          className="text-muted-foreground mt-1 shrink-0"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 text-[14.5px] leading-tight font-semibold">
          {primaryCol ? (
            <CellEditor
              column={primaryCol}
              value={row.cells[primaryCol.id] ?? null}
              onChange={(v) => onUpdateCell(row.id, primaryCol.id, v)}
              editable={editable}
              isPrimary
            />
          ) : (
            <span className="text-foreground">Untitled</span>
          )}
        </div>
        {hasBodyContent(row.body) && (
          <AlignLeft className="text-muted-foreground/60 mt-1 h-3.5 w-3.5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => {
            if (!consumedClick()) onOpenRow(row.id);
          }}
          aria-label="Open page"
          title="Open page"
          className="text-muted-foreground hover:bg-muted/50 hover:text-foreground mt-0.5 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover/card:opacity-100"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isCollapsed && (
        <div className="flex flex-col gap-1.5">
          {shownFields.length === 0 ? (
            <span className="text-muted-foreground/60 text-xs">No fields shown</span>
          ) : (
            shownFields.map((col) => (
              <div key={col.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="text-muted-foreground w-20 shrink-0 truncate">{col.name}</span>
                <span className={cn('min-w-0 flex-1', col.type === 'number' && 'tabular-nums')}>
                  <CellEditor
                    column={col}
                    value={row.cells[col.id] ?? null}
                    onChange={(v) => onUpdateCell(row.id, col.id, v)}
                    editable={editable}
                  />
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
