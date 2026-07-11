'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Floating "+" gutters and delete controls that appear on the hovered
 * table. Replaces the fixed toolbar strip that used to sit at the top of
 * the page — controls are contextual now, appearing at the table's edges
 * and inside its rows/columns only when the user is actually working
 * with a table.
 *
 * Gestures:
 *  - Hover the table → a "+" appears at the right edge (add column) and
 *    at the bottom edge (add row), aligned with the table.
 *  - Hover a specific row → a trash icon appears at the row's right end
 *    (delete row).
 *  - Hover a specific column → a trash icon appears above its header
 *    (delete column).
 *  - The bottom-right corner shows a compact "delete table" button when
 *    any part of the table is hovered.
 */
export function TableFloatingControls({ editor }: { editor: Editor }) {
  const [hoveredTable, setHoveredTable] = useState<HTMLTableElement | null>(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColIndex, setHoveredColIndex] = useState<number | null>(null);
  const [tableBox, setTableBox] = useState<DOMRect | null>(null);
  const [rowBoxes, setRowBoxes] = useState<DOMRect[]>([]);
  const [colBoxes, setColBoxes] = useState<DOMRect[]>([]);

  // Track pointermove over the editor and figure out which table (and
  // which row/column inside it) the cursor is over. Bail out cheaply
  // whenever the pointer leaves any table.
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const parent = dom.closest('div') ?? dom;

    const clearAll = () => {
      setHoveredTable(null);
      setHoveredRowIndex(null);
      setHoveredColIndex(null);
      setTableBox(null);
      setRowBoxes([]);
      setColBoxes([]);
    };

    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // Keep the overlay alive when the pointer is on one of our floating
      // buttons — otherwise moving from a cell to the button clears state
      // and the button unmounts before the click can fire.
      if (target?.closest('[data-table-controls]')) return;

      const table = target?.closest('table') as HTMLTableElement | null;
      if (!table || !dom.contains(table)) {
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

    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', clearAll);
    return () => {
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', clearAll);
    };
  }, [editor]);

  // Whenever the hovered table changes (or its dimensions do), measure
  // the table + per-row + per-column bounding boxes so the overlay can
  // sit exactly on them. Uses a ResizeObserver so column resizes stay
  // in sync.
  useLayoutEffect(() => {
    if (!hoveredTable) return;
    // When hoveredTable becomes null the render below bails out via the
    // `if (!hoveredTable || !tableBox) return null;` guard, so stale box
    // state is invisible until the next hovered table re-measures.

    const measure = () => {
      setTableBox(hoveredTable.getBoundingClientRect());
      const rows = Array.from(hoveredTable.querySelectorAll('tr')) as HTMLTableRowElement[];
      setRowBoxes(rows.map((r) => r.getBoundingClientRect()));
      const firstRow = rows[0];
      if (firstRow) {
        setColBoxes(Array.from(firstRow.children).map((c) => c.getBoundingClientRect()));
      } else {
        setColBoxes([]);
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
  }, [hoveredTable]);

  if (!hoveredTable || !tableBox) return null;

  // Focus + run a command against the cell at (rowIndex, colIndex) so the
  // Tiptap command has a valid selection to work on even if the current
  // ProseMirror selection is somewhere else on the page.
  const runAt = (rowIndex: number, colIndex: number, cmd: (e: Editor) => void) => {
    const rows = Array.from(hoveredTable.querySelectorAll('tr'));
    const row = rows[rowIndex];
    const cell = row?.children[colIndex] as HTMLElement | undefined;
    if (cell) {
      // Move the ProseMirror selection to the first position inside this
      // cell before firing the command — the row/column commands operate
      // on the selection's parent cell.
      const pos = editor.view.posAtDOM(cell, 0);
      if (pos != null && pos >= 0) {
        editor.chain().setTextSelection(pos).focus().run();
      }
    }
    cmd(editor);
  };

  const addRowBelow = () =>
    hoveredTable.querySelectorAll('tr').length
      ? runAt(hoveredTable.querySelectorAll('tr').length - 1, 0, (e) =>
          e.chain().focus().addRowAfter().run()
        )
      : undefined;

  const addColRight = () =>
    hoveredTable.querySelectorAll('tr').length
      ? runAt(0, colBoxes.length - 1, (e) => e.chain().focus().addColumnAfter().run())
      : undefined;

  const deleteRow = (rowIndex: number) =>
    runAt(rowIndex, 0, (e) => e.chain().focus().deleteRow().run());

  const deleteCol = (colIndex: number) =>
    runAt(0, colIndex, (e) => e.chain().focus().deleteColumn().run());

  const deleteTable = () => runAt(0, 0, (e) => e.chain().focus().deleteTable().run());

  // Portal the whole overlay to <body> so it escapes any stacking context
  // set up by the editor's ancestors (the ProseMirror div creates one at
  // times, which was intercepting Playwright-style clicks on our buttons).
  return createPortal(
    <>
      {/* Column gutter: "+" at the right edge of the table + delete on
          the hovered column's header. */}
      <button
        type="button"
        onClick={addColRight}
        aria-label="Add column"
        title="Add column"
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          left: tableBox.right + 4,
          top: tableBox.top,
          height: tableBox.height,
        }}
        className={cn(
          'group text-muted-foreground/60 hover:text-primary flex w-6 items-center justify-center rounded-md transition-colors',
          'hover:bg-primary/10'
        )}
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Row gutter: "+" under the bottom edge. */}
      <button
        type="button"
        onClick={addRowBelow}
        aria-label="Add row"
        title="Add row"
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          top: tableBox.bottom + 4,
          left: tableBox.left,
          width: tableBox.width,
        }}
        className={cn(
          'text-muted-foreground/60 hover:text-primary flex h-6 items-center justify-center rounded-md transition-colors',
          'hover:bg-primary/10'
        )}
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Delete row button on the currently hovered row. */}
      {hoveredRowIndex != null && rowBoxes[hoveredRowIndex] && (
        <button
          type="button"
          onClick={() => deleteRow(hoveredRowIndex)}
          aria-label="Delete row"
          title="Delete row"
          style={{
            position: 'fixed',
            top: rowBoxes[hoveredRowIndex].top + rowBoxes[hoveredRowIndex].height / 2 - 12,
            left: tableBox.left - 28,
          }}
          className="text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive flex h-6 w-6 items-center justify-center rounded transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Delete column button above the currently hovered column. */}
      {hoveredColIndex != null && colBoxes[hoveredColIndex] && (
        <button
          type="button"
          onClick={() => deleteCol(hoveredColIndex)}
          aria-label="Delete column"
          title="Delete column"
          style={{
            position: 'fixed',
            top: tableBox.top - 28,
            left: colBoxes[hoveredColIndex].left + colBoxes[hoveredColIndex].width / 2 - 12,
          }}
          className="text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive flex h-6 w-6 items-center justify-center rounded transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Delete-table button — small, in the top-right corner of the
          table, only appears when the cursor is on the table. */}
      <button
        type="button"
        onClick={deleteTable}
        aria-label="Delete table"
        title="Delete table"
        data-table-controls=""
        style={{
          zIndex: 60,
          position: 'fixed',
          top: tableBox.top - 28,
          left: tableBox.right - 24,
        }}
        className="text-muted-foreground/70 bg-background/80 hover:bg-destructive/10 hover:text-destructive flex h-6 w-6 items-center justify-center rounded border backdrop-blur transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>,
    document.body
  );
}
