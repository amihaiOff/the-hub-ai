import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { pushConfigured, sendPushToHousehold } from '@/lib/notifications/push';

/** POST /api/push/test — send a test notification to the household's devices. */
export async function POST() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Notifications are not set up on the server yet (VAPID keys missing).',
      },
      { status: 503 }
    );
  }
  const delivered = await sendPushToHousehold(context.activeHousehold.id, {
    title: 'The Hub',
    body: 'Notifications are working on this device.',
    url: '/settings/notifications',
    tag: 'test',
  });
  return NextResponse.json({ success: true, data: { delivered } });
}
