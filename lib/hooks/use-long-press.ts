'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LongPressOptions {
  /** How long (ms) the pointer must be held still before firing. */
  delay?: number;
  /** Movement (px) beyond which the gesture is treated as a scroll/drag. */
  moveTolerance?: number;
}

/**
 * Detects a press-and-hold gesture (touch or mouse) without swallowing normal
 * clicks or scrolls.
 *
 * Two attachment APIs are returned:
 *
 *   - `handlers`: React synthetic pointer/context handlers, ergonomic to
 *     spread onto an element.
 *   - `bindRef`: a ref callback that attaches NATIVE pointer listeners with
 *     `{ passive: true }`. Use this on iOS-critical elements — React
 *     attaches its synthetic pointer handlers as non-passive, and iOS
 *     Safari holds the first touch briefly while it decides if the JS
 *     might call `preventDefault()`. That hold is the "first tap doesn't
 *     scroll" symptom on tappable list cards. Passive listeners tell the
 *     browser we won't preventDefault, so the scroll gesture starts
 *     immediately.
 *
 * `consumedClick()` returns true if the just-completed interaction fired the
 * long-press callback, so the browser click that follows can be ignored.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10 }: LongPressOptions = {}
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback((_e?: React.PointerEvent) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    (button: number, x: number, y: number) => {
      if (button !== 0) return;
      fired.current = false;
      origin.current = { x, y };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress]
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (!origin.current) return;
      const dx = Math.abs(x - origin.current.x);
      const dy = Math.abs(y - origin.current.y);
      if (dx > moveTolerance || dy > moveTolerance) cancel();
    },
    [cancel, moveTolerance]
  );

  // React synthetic API — same shape as before, backwards-compatible.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => start(e.button, e.clientX, e.clientY),
    [start]
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => move(e.clientX, e.clientY), [move]);

  // Native passive-listener API — attach via ref. iOS Safari uses the
  // passive flag as a hint that scroll can begin immediately, without
  // waiting to see if the handler calls preventDefault().
  const [node, setNode] = useState<HTMLElement | null>(null);
  const bindRef = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const onDown = (e: PointerEvent) => start(e.button, e.clientX, e.clientY);
    const onMove = (e: PointerEvent) => move(e.clientX, e.clientY);
    const onEnd = () => cancel();
    const onCtx = (e: MouseEvent) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: true };
    node.addEventListener('pointerdown', onDown, opts);
    node.addEventListener('pointermove', onMove, opts);
    node.addEventListener('pointerup', onEnd, opts);
    node.addEventListener('pointerleave', onEnd, opts);
    node.addEventListener('pointercancel', onEnd, opts);
    node.addEventListener('contextmenu', onCtx);
    return () => {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onEnd);
      node.removeEventListener('pointerleave', onEnd);
      node.removeEventListener('pointercancel', onEnd);
      node.removeEventListener('contextmenu', onCtx);
    };
  }, [node, start, move, cancel]);

  const consumedClick = useCallback(() => {
    if (fired.current) {
      fired.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    bindRef,
    consumedClick,
  };
}
