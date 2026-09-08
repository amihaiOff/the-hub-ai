'use client';

import { useEffect, useRef } from 'react';

/**
 * Makes the browser Back button close an in-app overlay (a sheet, a
 * selection mode, a modal) instead of navigating away.
 *
 * While `active` is true a dummy same-URL history entry is on the stack, so
 * Back is a no-op navigation that only fires popstate — which calls `onClose`.
 * Closing by any other means (a Cancel button, an Escape key, emptying the
 * selection) flips `active` to false, and this hook then pops the dummy entry
 * so the history stack stays balanced. (Next's App Router treats a same-URL
 * pop as a non-navigation and re-renders in place.)
 *
 * Every `history.back()` this hook issues is counted in `selfPopRef` so the
 * popstate it produces isn't mistaken for the user pressing Back. Without that,
 * the unmount cleanup below would close the overlay it was trying to clean up
 * after: `history.back()` is async, so under React StrictMode's double-invoked
 * mount effects the sequence is push → (simulated unmount) back() → push again
 * → the queued popstate lands and reads as a real Back. That made the database
 * row-detail sheet flash open and immediately close in development.
 */
export function useBackToClose(active: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  /** Number of popstate events we've caused ourselves and must ignore. */
  const selfPopRef = useRef(0);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (active) {
      if (!pushedRef.current) {
        pushedRef.current = true;
        window.history.pushState({ backClose: true }, '');
      }
    } else if (pushedRef.current) {
      // Closed by something other than Back — remove our dummy entry, but only
      // if it's still the current one (a real navigation may have pushed on top).
      pushedRef.current = false;
      if (window.history.state?.backClose) {
        selfPopRef.current += 1;
        window.history.back();
      }
    }
  }, [active]);

  useEffect(() => {
    const onPopState = () => {
      // A pop we caused (deliberate close, or unmount cleanup) — not the user.
      if (selfPopRef.current > 0) {
        selfPopRef.current -= 1;
        return;
      }
      if (pushedRef.current) {
        pushedRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // If the host unmounts while still open, pop our entry — but only if it's
  // still current, so we never undo a real navigation the user just made.
  useEffect(
    () => () => {
      if (pushedRef.current && window.history.state?.backClose) {
        pushedRef.current = false;
        selfPopRef.current += 1;
        window.history.back();
      }
    },
    []
  );
}
