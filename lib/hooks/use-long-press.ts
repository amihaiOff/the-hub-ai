'use client';

import { useCallback, useEffect, useRef } from 'react';

interface LongPressOptions {
  /** How long (ms) the pointer must be held still before firing. */
  delay?: number;
  /** Movement (px) beyond which the gesture is treated as a scroll/drag. */
  moveTolerance?: number;
}

/**
 * Detects a press-and-hold gesture (touch or mouse) without swallowing normal
 * clicks or scrolls. Returns pointer handlers to spread onto an element plus
 * `consumedClick()`, which the element's onClick should call first: it returns
 * true when the just-completed interaction was a long press, so the click that
 * the browser fires afterwards can be ignored.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10 }: LongPressOptions = {}
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  // Accepts an optional event so it can be used directly as a pointer handler.
  const cancel = useCallback((_e?: React.PointerEvent) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  // Never let a pending timer fire after the element unmounts (e.g. a list
  // refetch removes the card mid-hold).
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only the primary (left / touch) button starts a long press.
      if (e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!origin.current) return;
      const dx = Math.abs(e.clientX - origin.current.x);
      const dy = Math.abs(e.clientY - origin.current.y);
      if (dx > moveTolerance || dy > moveTolerance) cancel();
    },
    [cancel, moveTolerance]
  );

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
      // Touch scroll / gesture takeover fires pointercancel (not up/move), so
      // cancel here too or a paused scroll would trip the long press.
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    consumedClick,
  };
}
