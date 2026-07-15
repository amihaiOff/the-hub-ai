'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { GripVertical } from 'lucide-react';
import { buildMoveTransaction, computeDropTarget, topLevelBlocks, topLevelPos } from './block-drag';

/** True on narrow (mobile) viewports — mirrors the desktop handle's `md` cutoff. */
function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

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

  // Removes the active drag's window listeners + stops auto-scroll. Held in a
  // ref so both pointerup and an unmount-mid-drag can tear the drag down.
  const teardown = useRef<(() => void) | null>(null);
  const endDrag = useCallback(() => {
    teardown.current?.();
    teardown.current = null;
    cancelAnimationFrame(autoScrollRaf.current);
    setDragging(false);
    setIndicatorY(null);
    dragFrom.current = null;
    insertPos.current = null;
  }, []);
  // Safety net: if the component unmounts while a drag is in flight, remove the
  // window listeners so they can't fire against a dead component.
  useEffect(() => () => teardown.current?.(), []);

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
      track(e.clientY);
    },
    [anchor, editor, endDrag]
  );

  if (!isMobile || !anchor) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Drag to reorder block"
        title="Drag to reorder"
        onPointerDown={onPointerDown}
        style={{
          position: 'fixed',
          top: anchor.top + 2,
          left: Math.max(2, anchor.left),
          touchAction: 'none',
        }}
        className={
          'border-border/60 bg-background/95 text-muted-foreground/70 z-40 flex h-7 w-6 items-center justify-center rounded-md border shadow-sm backdrop-blur ' +
          (dragging ? 'text-foreground scale-110' : '')
        }
      >
        <GripVertical className="h-4 w-4" />
      </button>
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
    </>
  );
}
