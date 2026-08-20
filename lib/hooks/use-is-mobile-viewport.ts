'use client';

import { useEffect, useState } from 'react';

/**
 * True on narrow (mobile) viewports (`max-width: 767px`) — the app's mobile
 * cutoff. SSR-safe: starts false and updates after mount. Shared by the page
 * editor's mobile affordances (drag handle, database entry sheet).
 */
export function useIsMobileViewport(): boolean {
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
