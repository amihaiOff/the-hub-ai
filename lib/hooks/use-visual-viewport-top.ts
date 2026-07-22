'use client';

import { useEffect, useState } from 'react';

/**
 * Track the vertical centre of the visualViewport so a fixed-position modal
 * can stay visible when the on-screen keyboard opens. Returns the y-coordinate
 * (in CSS pixels) of the current visible-viewport centre. Falls back to
 * `window.innerHeight / 2` when the API is unavailable.
 */
export function useVisualViewportTop(): number | null {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setTop(vv.offsetTop + vv.height / 2);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return top;
}
