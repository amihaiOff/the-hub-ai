'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker on the client after the app has loaded.
 * Rendered once from the root layout. No-ops when service workers are
 * unsupported or in development (to avoid stale caches while iterating).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(relinkPushSubscription)
        .catch((error) => {
          console.error('Service worker registration failed:', error);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}

/**
 * Re-send this device's existing push subscription so the server links it to
 * whoever is signed in now (personal habit reminders go to the owner's
 * devices only). Idempotent upsert; a 401 before sign-in is harmless.
 */
async function relinkPushSubscription(reg: ServiceWorkerRegistration) {
  if (!('PushManager' in window) || Notification.permission !== 'granted') return;
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => undefined);
}
