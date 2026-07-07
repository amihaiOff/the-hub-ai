'use client';

import { useEffect, useState } from 'react';

/**
 * Height (in px) that the on-screen keyboard occupies over the layout
 * viewport. Backed by the VisualViewport API — the layout viewport
 * doesn't shrink when the keyboard opens on mobile, so fixed elements
 * anchored to `bottom` sit under the keyboard by default. Callers add
 * this value to their bottom offset to keep the element visible.
 *
 * Returns 0 when the keyboard is closed, or when VisualViewport is
 * unavailable (older browsers / SSR).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // window.innerHeight is the layout viewport height. vv.height +
      // vv.offsetTop gives us where the bottom of the visual viewport
      // sits within the layout viewport. Anything below that is covered
      // by system UI (usually the keyboard). We clamp small deltas
      // (browser chrome resizes fire tiny values) so the FAB doesn't
      // jitter on scroll.
      const raw = window.innerHeight - vv.height - vv.offsetTop;
      setInset(raw > 32 ? Math.round(raw) : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
