import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Mechanics for reordering top-level blocks by dragging — used by the mobile
 * drag handle (`mobile-block-drag-handle.tsx`). These are kept separate and
 * (mostly) pure so the fiddly position math is unit-testable without a browser.
 *
 * "Top-level block" = a direct child of the document (paragraph, heading, list,
 * blockquote, code block, image, table, `columnBlock`, `databaseBlock`, …).
 * Reordering is scoped to this level only: a whole `columnBlock` moves as a
 * unit, and there's no dropping a block *into* a column.
 */

export interface BlockRect {
  /** Document position of the boundary just before this top-level node. */
  pos: number;
  node: PMNode;
  rect: DOMRect;
}

/** The minimal rect shape `computeDropTarget` needs (kept test-friendly). */
export interface DropBlock {
  pos: number;
  rect: { top: number; height: number; bottom: number };
}

export interface DropTarget {
  /** Document position at which the dragged node should be inserted. */
  insertPos: number;
  /** Client-Y at which to draw the drop indicator line. */
  indicatorY: number;
}

/**
 * The document position of the top-level block containing the current
 * selection — i.e. the boundary just before that block. Walks up to depth 1 so
 * a selection deep inside a column resolves to the whole `columnBlock`. A
 * top-level NodeSelection (e.g. an atom like the database block) has depth 0
 * and its `$from.pos` is already that boundary. `null` if it can't be resolved.
 */
export function topLevelPos(state: EditorState): number | null {
  const { $from } = state.selection;
  if ($from.depth === 0) return $from.pos;
  return $from.before(1);
}

/**
 * Every top-level block with its current on-screen rect. `nodeDOM(offset)`
 * returns the DOM node starting at that position; blocks without an element
 * DOM node (shouldn't happen for block content) are skipped.
 */
export function topLevelBlocks(editor: Editor): BlockRect[] {
  const { state, view } = editor;
  const out: BlockRect[] = [];
  state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      out.push({ pos: offset, node, rect: dom.getBoundingClientRect() });
    }
  });
  return out;
}

/**
 * Given the top-level block rects, the document's end position, and a pointer
 * Y (client coords), decide where a dropped block lands: before the first block
 * whose vertical midpoint is below the pointer, otherwise appended at the end.
 */
export function computeDropTarget(blocks: DropBlock[], endPos: number, y: number): DropTarget {
  for (const b of blocks) {
    const mid = b.rect.top + b.rect.height / 2;
    if (y < mid) return { insertPos: b.pos, indicatorY: b.rect.top };
  }
  const last = blocks[blocks.length - 1];
  return { insertPos: endPos, indicatorY: last ? last.rect.bottom : 0 };
}

/**
 * Build a transaction that moves the top-level node starting at `from` so it is
 * inserted at `insertPos`. Returns `null` for a no-op — dropping the block onto
 * its own span (before itself or in the gap immediately after itself).
 */
export function buildMoveTransaction(
  state: EditorState,
  from: number,
  insertPos: number
): Transaction | null {
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  const to = from + node.nodeSize;
  // Inserting anywhere inside [from, to] leaves the block where it is.
  if (insertPos >= from && insertPos <= to) return null;
  let tr = state.tr.delete(from, to);
  // Map the target through the delete so it still points at the right gap.
  const mapped = tr.mapping.map(insertPos);
  tr = tr.insert(mapped, node);
  return tr.scrollIntoView();
}
