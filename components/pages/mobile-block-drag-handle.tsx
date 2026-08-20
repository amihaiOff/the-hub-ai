'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import {
  buildDeleteTransaction,
  buildMoveTransaction,
  computeDropTarget,
  topLevelBlocks,
  topLevelPos,
} from './block-drag';

interface Anchor {
  top: number;
  left: number;
  pos: number;
}

/**
 * Touch/mobile block-reorder handle. The desktop `<DragHandle>` uses the HTML5
 * drag API (dead on touch), so on mobile we render our own six-dot grip beside
 * the selected top-level block and drive the drag with Pointer Events +
 * `touch-action: none` — the approach that actually works on iOS Safari /
 * Android. Tapping into a block reveals its grip; dragging the grip reorders
 * the block among the document's top-level children. See `block-drag.ts` for
 * the position math.
 */
export function MobileBlockDragHandle({ editor }: { editor: Editor }) {
  const isMobile = useIsMobileViewport();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [dragging, setDragging] = useState(false);
  const [indicatorY, setIndicatorY] = useState<number | null>(null);
  // Block action menu (opened by long-pressing the grip). Holds its own anchor
  // + block position so it survives selection/anchor changes while open.
  const [menu, setMenu] = useState<{ top: number; left: number; pos: number } | null>(null);

  // Position the grip against the top-level block holding the selection.
  const recompute = useCallback(() => {
    if (!editor.isEditable) {
      setAnchor(null);
      return;
    }
    const pos = topLevelPos(editor.state);
    if (pos == null) {
      setAnchor(null);
      return;
    }
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      setAnchor(null);
      return;
    }
    const top = dom.getBoundingClientRect().top;
    // Anchor the grip to the editor's left gutter (a consistent left channel)
    // rather than each block's own left edge — so a full-bleed block (e.g. the
    // mobile-width database) doesn't push the grip on top of its content.
    const left = editor.view.dom.getBoundingClientRect().left;
    // Skip the state update (and re-render) when nothing moved — `transaction`
    // fires on every keystroke.
    setAnchor((prev) =>
      prev && prev.top === top && prev.left === left && prev.pos === pos ? prev : { top, left, pos }
    );
  }, [editor]);

  useEffect(() => {
    if (!isMobile) return;
    // Grip is fixed-positioned, so it must follow the block on scroll/resize
    // and selection changes. rAF-defer keeps the (state-setting) recompute out
    // of the effect body and coalesces bursts of events into one measure/frame
    // (selectionUpdate + transaction otherwise both fire on a selection move).
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    schedule();
    editor.on('selectionUpdate', schedule);
    editor.on('transaction', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      editor.off('selectionUpdate', schedule);
      editor.off('transaction', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(raf);
    };
  }, [editor, isMobile, recompute]);

  const dragFrom = useRef<number | null>(null);
  const insertPos = useRef<number | null>(null);
  const autoScrollRaf = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Removes the active drag's window listeners + stops auto-scroll. Held in a
  // ref so both pointerup and an unmount-mid-drag can tear the drag down.
  const teardown = useRef<(() => void) | null>(null);
  const endDrag = useCallback(() => {
    teardown.current?.();
    teardown.current = null;
    cancelAnimationFrame(autoScrollRaf.current);
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    setDragging(false);
    setIndicatorY(null);
    dragFrom.current = null;
    insertPos.current = null;
  }, []);
  // Safety net: if the component unmounts mid-drag or mid-long-press, remove the
  // window listeners and cancel the pending timer so neither fires against a
  // dead component.
  useEffect(
    () => () => {
      teardown.current?.();
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    []
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!anchor) return;
      // Ignore secondary touches and re-entry while a drag is already active
      // (a second finger must not double-arm the listeners).
      if (!e.isPrimary || teardown.current) return;
      // Stop the tap from moving the text cursor / focusing the editor.
      e.preventDefault();
      const from = anchor.pos;
      const node = editor.state.doc.nodeAt(from);
      const fromEnd = node ? from + node.nodeSize : from;
      dragFrom.current = from;
      setDragging(true);

      // Long-press opens the block menu; any real movement first is a drag and
      // cancels it ("longer than required to move the block; if the block is
      // moving, don't open the menu").
      const LONGPRESS_MS = 500;
      const MOVE_TOL = 8;
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;
      const menuAnchor = { top: anchor.top, left: Math.max(2, anchor.left), pos: from };
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        if (moved) return; // a drag is underway — suppress the menu
        endDrag(); // stop the drag machinery; releasing must not reorder
        setMenu(menuAnchor);
      }, LONGPRESS_MS);

      // Measure the blocks once; their rects only change when the page scrolls,
      // so we re-measure on auto-scroll rather than on every pointermove.
      let blocks = topLevelBlocks(editor);

      const track = (clientY: number) => {
        const endPos = editor.state.doc.content.size;
        const target = computeDropTarget(blocks, endPos, clientY);
        insertPos.current = target.insertPos;
        // Hide the indicator when the drop would be a no-op (onto the block's
        // own span) — buildMoveTransaction rejects it, so don't tease a drop.
        const noop = target.insertPos >= from && target.insertPos <= fromEnd;
        setIndicatorY(noop ? null : target.indicatorY);
      };

      // Keep the drop point live while auto-scrolling near a screen edge.
      const autoScroll = (clientY: number) => {
        cancelAnimationFrame(autoScrollRaf.current);
        const MARGIN = 64;
        const SPEED = 12;
        const tick = () => {
          let dy = 0;
          if (clientY < MARGIN) dy = -SPEED;
          else if (clientY > window.innerHeight - MARGIN) dy = SPEED;
          if (dy !== 0) {
            window.scrollBy(0, dy);
            blocks = topLevelBlocks(editor); // rects shifted with the scroll
            track(clientY);
            autoScrollRaf.current = requestAnimationFrame(tick);
          }
        };
        tick();
      };

      const onMove = (ev: PointerEvent) => {
        // Until the finger travels past the tolerance, treat it as a stationary
        // hold — don't drag, don't show the indicator, let the long-press timer
        // keep running.
        if (!moved) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < MOVE_TOL) return;
          moved = true;
          if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
          }
        }
        ev.preventDefault();
        track(ev.clientY);
        autoScroll(ev.clientY);
      };
      const finish = (commit: boolean) => {
        const src = dragFrom.current;
        const dst = insertPos.current;
        endDrag();
        if (!commit || src == null || dst == null) return;
        const tr = buildMoveTransaction(editor.state, src, dst);
        if (tr) {
          editor.view.dispatch(tr);
          editor.commands.focus();
        }
      };
      // pointerup commits; pointercancel (system interruption) discards — a
      // cancelled gesture must never silently reorder the document.
      const onUp = () => finish(true);
      const onCancel = () => finish(false);

      teardown.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      // No initial track() — the indicator only appears once a real drag starts,
      // so a stationary long-press reads as a hold, not a move.
    },
    [anchor, editor, endDrag]
  );

  // Close the block menu on an outside tap or Escape.
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (ev: PointerEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMenu(null);
    };
    // Any document change (edit elsewhere, another block deleted) can shift
    // positions, so close rather than risk acting on a stale block position.
    const closeOnTx = () => setMenu(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    editor.on('transaction', closeOnTx);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      editor.off('transaction', closeOnTx);
    };
  }, [menu, editor]);

  const deleteBlock = useCallback(() => {
    if (!menu) return;
    const tr = buildDeleteTransaction(editor.state, menu.pos);
    if (tr) editor.view.dispatch(tr);
    setMenu(null);
  }, [editor, menu]);

  if (!isMobile) return null;

  return (
    <>
      {anchor && (
        <button
          type="button"
          aria-label="Drag to reorder block, long-press for options"
          title="Drag to reorder · long-press for options"
          onPointerDown={onPointerDown}
          style={{
            position: 'fixed',
            top: anchor.top + 2,
            left: Math.max(2, anchor.left),
            touchAction: 'none',
          }}
          className={cn(
            'border-border/60 bg-background/95 text-muted-foreground/70 z-40 flex h-7 w-6 items-center justify-center rounded-md border shadow-sm backdrop-blur',
            dragging && 'text-foreground scale-110'
          )}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {dragging &&
        indicatorY != null &&
        createPortal(
          <div
            aria-hidden
            className="bg-primary pointer-events-none z-50"
            style={{ position: 'fixed', left: 0, right: 0, top: indicatorY - 1, height: 2 }}
          />,
          document.body
        )}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: Math.min(menu.top, window.innerHeight - 60),
              left: Math.min(menu.left + 28, window.innerWidth - 176),
            }}
            className="bg-popover text-popover-foreground z-[100] w-40 rounded-xl border p-1 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={deleteBlock}
              className="hover:bg-destructive/10 text-destructive flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm"
            >
              <Trash2 className="h-4 w-4" /> Delete block
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
