'use client';

import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** VAPID keys are URL-safe base64; PushManager wants raw bytes. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Support =
  | 'checking'
  | 'ok'
  | 'unsupported'
  | 'ios-needs-install'
  | 'not-configured'
  | 'blocked';

function detectSupport(): Support {
  if (!PUBLIC_KEY) return 'not-configured';
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios-needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
}

async function postJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
  return data;
}

/**
 * Turn push notifications on or off for THIS phone/browser. Whether this
 * device is subscribed is device state (the browser's PushManager), so it's
 * read from the browser rather than the server.
 */
export function NotificationSettings() {
  const [support, setSupport] = useState<Support>('checking');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    const s = detectSupport();
    let cancelled = false;
    void (async () => {
      let sub = false;
      if (s === 'ok') {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = await reg?.pushManager.getSubscription();
        sub = !!existing;
        // Re-register with the server (idempotent): its copy can be gone
        // (pruned, moved household, restored backup) while the phone still
        // thinks it's subscribed.
        if (existing) await postJson('/api/push', 'POST', existing.toJSON()).catch(() => undefined);
      }
      if (!cancelled) {
        setSupport(s);
        setSubscribed(sub);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await action() });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Something went wrong.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const turnOn = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(
          'Notifications are blocked for this app. Allow them in the phone settings.'
        );
      }
      await navigator.serviceWorker.register('/sw.js');
      // Subscribe on the active worker (register() may return one still installing).
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(PUBLIC_KEY),
        }));
      await postJson('/api/push', 'POST', sub.toJSON());
      setSubscribed(true);
      return 'Notifications are on for this device.';
    });

  const turnOff = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await postJson('/api/push', 'DELETE', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return 'Notifications are off for this device.';
    });

  const sendTest = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error('This device is not registered. Turn notifications on first.');
      const { data } = await postJson('/api/push/test', 'POST', { endpoint: sub.endpoint });
      return data.delivered > 0
        ? 'Test sent. It should arrive in a few seconds.'
        : "It didn't go through. Try turning notifications off and on again.";
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Notifications on this device</p>
        <p className="text-muted-foreground text-xs">
          You&apos;ll be notified when the daily bank sync fails, and every Saturday evening with
          the week&apos;s eating-out spending. Each phone that should get them has to be turned on
          here.
        </p>
      </div>

      {support === 'checking' && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
      {support === 'not-configured' && (
        <p className="text-muted-foreground text-sm">
          Notifications aren&apos;t set up on the server yet.
        </p>
      )}
      {support === 'blocked' && (
        <p className="text-muted-foreground text-sm">
          Notifications are blocked for this app. Allow them in your phone&apos;s settings for The
          Hub, then reopen this page.
        </p>
      )}
      {support === 'unsupported' && (
        <p className="text-muted-foreground text-sm">
          This browser can&apos;t receive notifications.
        </p>
      )}
      {support === 'ios-needs-install' && (
        <p className="text-muted-foreground text-sm">
          On iPhone, add The Hub to your Home Screen (Share → Add to Home Screen), open it from
          there, and come back to this page.
        </p>
      )}

      {support === 'ok' && (
        <div className="flex flex-wrap items-center gap-2">
          {subscribed ? (
            <>
              <Button variant="outline" onClick={turnOff} disabled={busy}>
                <BellOff className="mr-2 h-4 w-4" />
                Turn off
              </Button>
              <Button onClick={sendTest} disabled={busy}>
                <Send className="mr-2 h-4 w-4" />
                Send a test
              </Button>
            </>
          ) : (
            <Button onClick={turnOn} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="mr-2 h-4 w-4" />
              )}
              Turn on notifications
            </Button>
          )}
        </div>
      )}

      {message && (
        <p className={message.error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}>
          {message.text}
        </p>
      )}
    </div>
  );
}
