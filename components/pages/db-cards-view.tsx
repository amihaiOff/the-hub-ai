'use client';

import { useState } from 'react';
import { AlignLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DatabaseColumn, DatabaseRow } from './database-extension';
import { hasBodyContent } from '@/lib/pages/db-rows';
import { CellValueDisplay, isEmptyCellValue } from './db-cells';

interface DbCardsViewProps {
  primaryCol: DatabaseColumn | null;
  fieldCols: DatabaseColumn[];
  rows: DatabaseRow[];
  hideEmptyCardFields: boolean;
  hasActiveFilters: boolean;
  totalRowCount: number;
  onOpenRow: (rowId: string) => void;
}

/**
 * Cards view: a responsive grid where each row is a card with the primary
 * column as the hero title and the Properties-selected columns rendered as
 * `label: value` fields (empty fields optionally hidden). Cards collapse to
 * title-only individually, or all at once via the toolbar row. Clicking a card
 * opens the row's entry sheet. Per-card collapse is ephemeral (per-viewer).
 */
export function DbCardsView({
  primaryCol,
  fieldCols,
  rows,
  hideEmptyCardFields,
  hasActiveFilters,
  totalRowCount,
  onOpenRow,
}: DbCardsViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const title = (row: DatabaseRow): string => {
    if (!primaryCol) return 'Untitled';
    const v = row.cells[primaryCol.id];
    return typeof v === 'string' && v.trim() ? v : 'Untitled';
  };

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
        {rows.map((row) => {
          const isCollapsed = collapsed.has(row.id);
          const shownFields = fieldCols.filter(
            (c) => !hideEmptyCardFields || !isEmptyCellValue(row.cells[c.id] ?? null)
          );
          return (
            <div
              key={row.id}
              className="border-border/70 bg-card/40 flex flex-col gap-3 rounded-2xl border p-3.5"
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-label={isCollapsed ? 'Expand card' : 'Collapse card'}
                  className="text-muted-foreground mt-0.5 shrink-0"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRow(row.id)}
                  className="text-foreground min-w-0 flex-1 text-left text-[14.5px] leading-tight font-semibold hover:underline"
                >
                  {title(row)}
                </button>
                {hasBodyContent(row.body) && (
                  <AlignLeft className="text-muted-foreground/60 mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
              </div>
              {!isCollapsed && (
                <div className="flex flex-col gap-1.5">
                  {shownFields.length === 0 ? (
                    <span className="text-muted-foreground/60 text-xs">No fields shown</span>
                  ) : (
                    shownFields.map((col) => (
                      <div key={col.id} className="flex items-center gap-2 text-[12.5px]">
                        <span className="text-muted-foreground w-20 shrink-0 truncate">
                          {col.name}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate',
                            col.type === 'number' && 'tabular-nums'
                          )}
                        >
                          <CellValueDisplay column={col} value={row.cells[col.id] ?? null} />
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
