'use client';

import { usePathname } from 'next/navigation';
import { isKnownRoutePath } from '@/lib/utils/page-titles';

/**
 * What the current location would be favourited *as*, or `null` when it can't
 * be favourited at all.
 *
 * Areas pages become `page` targets (a real FK, so the label stays live and the
 * favourite is cascade-deleted with the page). Everything else has to be a
 * nav-registered pathname, because that's the only thing we can later verify is
 * still alive — `defaultTitleForPath` always succeeds, so it can never report a
 * dead route. Dynamic content routes like `/wiki/<id>` therefore return `null`
 * and the star renders disabled.
 *
 * Deliberately reads `usePathname()` only, never `useSearchParams()`: route
 * targets are pathname-only by design, and `useSearchParams` would force this
 * client component into a Suspense boundary for no benefit.
 */
export type CurrentDestination =
  | { kind: 'page'; pageId: string }
  | { kind: 'route'; route: string }
  | null;

const AREAS_PAGE = /^\/areas\/([^/]+)$/;

export function useCurrentDestination(): CurrentDestination {
  const pathname = usePathname();
  if (!pathname) return null;

  const areasMatch = AREAS_PAGE.exec(pathname);
  if (areasMatch) return { kind: 'page', pageId: areasMatch[1] };

  if (isKnownRoutePath(pathname)) return { kind: 'route', route: pathname };

  return null;
}
