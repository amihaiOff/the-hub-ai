import webpush from 'web-push';
import { prisma } from '@/lib/db';

/**
 * Web Push to every phone/browser registered for a household.
 *
 * Needs VAPID keys in the environment (generate once with
 * `npx web-push generate-vapid-keys`):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — also used by the browser to subscribe
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT                 — e.g. "mailto:you@example.com"
 * Without them, sending is skipped (and logged) rather than failing callers.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Returns how many devices accepted the message. Never throws. */
export async function sendPushToHousehold(
  householdId: string,
  message: PushMessage
): Promise<number> {
  if (!pushConfigured()) {
    console.warn('Push not sent: VAPID keys are not configured.');
    return 0;
  }
  const subs = await prisma.pushSubscription.findMany({ where: { householdId } }).catch(() => []);
  const payload = JSON.stringify(message);
  const options = {
    vapidDetails: {
      subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
    },
    TTL: 24 * 60 * 60,
  };

  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          options
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the phone unsubscribed or the app was removed — forget it.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          console.error('Push send failed:', err);
        }
      }
    })
  );
  return delivered;
}
