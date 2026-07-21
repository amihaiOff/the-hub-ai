import { redirect } from 'next/navigation';

/**
 * Legacy `/dashboard` route. The finance dashboard now lives at `/`; this
 * redirects any lingering entry points here — most importantly PWA instances
 * installed with an older manifest that cached `start_url: '/dashboard'`, plus
 * old bookmarks/links — so everyone lands on the current dashboard.
 */
export default function LegacyDashboardRedirect() {
  redirect('/');
}
