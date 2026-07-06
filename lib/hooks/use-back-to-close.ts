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
 */
export function useBackToClose(active: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
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
      if (window.history.state?.backClose) window.history.back();
    }
  }, [active]);

  useEffect(() => {
    const onPopState = () => {
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
        window.history.back();
      }
    },
    []
  );
}
