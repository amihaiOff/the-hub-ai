'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { MoreVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Hover controls for a Tiptap table. Two persistent tabs sit at the
 * table's right and bottom edges for adding a column / row respectively,
 * and a single "⋮" menu in the top-right corner exposes destructive
 * operations (delete row/column/table) as a Radix dropdown so the click
 * lifecycle is managed and the menu can't be lost mid-move.
 *
 * All buttons carry `data-table-controls` so the hover-tracker's
 * pointermove and pointerleave both know to keep state alive while the
 * cursor is on them.
 */
export function TableFloatingControls({ editor }: { editor: Editor }) {
  const [hoveredTable, setHoveredTable] = useState<HTMLTableElement | null>(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColIndex, setHoveredColIndex] = useState<number | null>(null);
  const [tableBox, setTableBox] = useState<DOMRect | null>(null);
  const [hoveredRowBox, setHoveredRowBox] = useState<DOMRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const parent = dom.closest('div') ?? dom;

    const clearAll = () => {
      setHoveredTable(null);
      setHoveredRowIndex(null);
      setHoveredColIndex(null);
      setTableBox(null);
    };

    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // Keep state alive when the pointer is on any control — the buttons
      // are portalled to <body>, so moving to them would otherwise fire
      // pointerleave and unmount the button before the click lands.
      if (target?.closest('[data-table-controls]')) return;

      const table = target?.closest('table') as HTMLTableElement | null;
      // Database blocks render their own <table> but have their own edge
      // + tabs, delete-row gutter, and column menu — don't overlay them.
      if (!table || !dom.contains(table) || table.closest('.database-block')) {
        clearAll();
        return;
      }
      const cell = target?.closest('td, th') as HTMLTableCellElement | null;
      const row = cell?.closest('tr') as HTMLTableRowElement | null;
      const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
      const rowIndex = row ? rows.indexOf(row) : -1;
      const colIndex = cell && row ? Array.from(row.children).indexOf(cell) : -1;

      setHoveredTable(table);
      setHoveredRowIndex(rowIndex >= 0 ? rowIndex : null);
      setHoveredColIndex(colIndex >= 0 ? colIndex : null);
    };

    const onLeave = (e: PointerEvent) => {
      // relatedTarget is what we're moving TO. When it's one of our controls
      // (portalled outside `parent`), pointerleave on `parent` still fires
      // even though the user's intent is to reach the button, not leave.
      const rel = e.relatedTarget as Element | null;
      if (rel?.closest('[data-table-controls]')) return;
      // Radix opens dropdown content in a portal too; keep state while the
      // menu is up so clicks inside don't cause the anchor to unmount.
      if (rel?.closest('[data-radix-popper-content-wrapper]')) return;
      clearAll();
    };

    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', onLeave);
    return () => {
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', onLeave);
    };
  }, [editor]);

  useLayoutEffect(() => {
    if (!hoveredTable) return;
    const measure = () => {
      setTableBox(hoveredTable.getBoundingClientRect());
      // Also refresh the current row's rect so the delete-row button stays
      // aligned as content wraps / rows resize.
      if (hoveredRowIndex != null) {
        const rows = hoveredTable.querySelectorAll('tr');
        const row = rows[hoveredRowIndex] as HTMLTableRowElement | undefined;
        setHoveredRowBox(row ? row.getBoundingClientRect() : null);
      } else {
        setHoveredRowBox(null);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hoveredTable);
    hoveredTable.querySelectorAll('td, th').forEach((cell) => ro.observe(cell as HTMLElement));
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [hoveredTable, hoveredRowIndex]);

  // Keep the menu-open state from unmounting the anchor when the pointer
  // leaves the table momentarily — the Radix portal will handle dismissing
  // it on outside-click, so a stale hoveredTable during that window is
  // fine.
  const shouldRender = hoveredTable != null && tableBox != null;
  if (!shouldRender && !menuOpen) return null;
  if (!tableBox || !hoveredTable) return null;

  const runAt = (rowIndex: number, colIndex: number, cmd: (e: Editor) => void) => {
    const rows = Array.from(hoveredTable.querySelectorAll('tr'));
    const row = rows[rowIndex];
    const cell = row?.children[colIndex] as HTMLElement | undefined;
    if (cell) {
      const pos = editor.view.posAtDOM(cell, 0);
      if (pos != null && pos >= 0) {
        editor.chain().setTextSelection(pos).focus().run();
      }
    }
    cmd(editor);
  };

  const rowCount = hoveredTable.querySelectorAll('tr').length;
  const colCount = hoveredTable.querySelector('tr')?.children.length ?? 0;

  const activeRow = hoveredRowIndex ?? rowCount - 1;
  const activeCol = hoveredColIndex ?? colCount - 1;

  const addRowAbove = () => runAt(activeRow, 0, (e) => e.chain().focus().addRowBefore().run());
  const addRowBelow = () => runAt(activeRow, 0, (e) => e.chain().focus().addRowAfter().run());
  const addColLeft = () => runAt(0, activeCol, (e) => e.chain().focus().addColumnBefore().run());
  const addColRight = () => runAt(0, activeCol, (e) => e.chain().focus().addColumnAfter().run());
  const deleteRow = () =>
    hoveredRowIndex != null &&
    runAt(hoveredRowIndex, 0, (e) => e.chain().focus().deleteRow().run());
  const deleteCol = () =>
    hoveredColIndex != null &&
    runAt(0, hoveredColIndex, (e) => e.chain().focus().deleteColumn().run());
  const deleteTable = () => runAt(0, 0, (e) => e.chain().focus().deleteTable().run());

  return createPortal(
    <>
      {/* Left gutter: trash icon aligned to the currently-hovered row.
          Mirrors the database block's delete-row affordance so users have
          a discoverable one-click way to remove a row without having to
          open the ⋮ menu. Non-header rows only. */}
      {hoveredRowBox && hoveredRowIndex != null && hoveredRowIndex > 0 && (
        <button
          type="button"
          onClick={deleteRow}
          aria-label="Delete row"
          title="Delete row"
          data-table-controls=""
          style={{
            zIndex: 60,
            position: 'fixed',
            top: hoveredRowBox.top,
            height: hoveredRowBox.height,
            left: tableBox.left - 28,
          }}
          className="text-muted-foreground/70 hover:bg-destructive/15 hover:text-destructive flex w-6 items-center justify-center rounded-lg transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {/* Right edge: add column tab. Sits flush against the table edge so
          moving the cursor to it never crosses a big gap. */}
      <button
        type="button"
        onClick={addColRight}
        aria-label="Add column"
        title="Add column"
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          left: tableBox.right - 1,
          top: tableBox.top,
          height: tableBox.height,
        }}
        className={cn(
          'border-border/40 bg-background/70 text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 flex w-5 items-center justify-center rounded-r-lg border border-l-0 backdrop-blur transition-colors'
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {/* Bottom edge: add row tab. */}
      <button
        type="button"
        onClick={addRowBelow}
        aria-label="Add row"
        title="Add row"
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          top: tableBox.bottom - 1,
          left: tableBox.left,
          width: tableBox.width,
        }}
        className={cn(
          'border-border/40 bg-background/70 text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 flex h-5 items-center justify-center rounded-b-lg border border-t-0 backdrop-blur transition-colors'
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {/* Combined "⋮" menu in the top-right corner — all destructive and
          insert-before/after operations live here so we're not scattering
          trash icons around the table. Radix manages open/close and its
          own portal, so clicking is reliable regardless of hover state. */}
      <div
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          top: tableBox.top - 30,
          left: tableBox.right - 26,
        }}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Table options"
              title="Table options"
              className="border-border/40 bg-background/90 text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur transition-colors"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            <DropdownMenuItem onSelect={addRowAbove} className="rounded-lg text-xs">
              <Plus className="mr-2 h-3.5 w-3.5" /> Row above
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={addRowBelow} className="rounded-lg text-xs">
              <Plus className="mr-2 h-3.5 w-3.5" /> Row below
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={addColLeft} className="rounded-lg text-xs">
              <Plus className="mr-2 h-3.5 w-3.5" /> Column left
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={addColRight} className="rounded-lg text-xs">
              <Plus className="mr-2 h-3.5 w-3.5" /> Column right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hoveredRowIndex != null && (
              <DropdownMenuItem
                onSelect={deleteRow}
                className="text-destructive focus:text-destructive rounded-lg text-xs"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete row
              </DropdownMenuItem>
            )}
            {hoveredColIndex != null && (
              <DropdownMenuItem
                onSelect={deleteCol}
                className="text-destructive focus:text-destructive rounded-lg text-xs"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete column
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={deleteTable}
              className="text-destructive focus:text-destructive rounded-lg text-xs"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>,
    document.body
  );
}
