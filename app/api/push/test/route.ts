import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { pushConfigured, sendPushToHousehold } from '@/lib/notifications/push';

const bodySchema = z.object({ endpoint: z.string().min(1).max(2000) });

/** POST /api/push/test { endpoint } — send a test notification to THIS device only. */
export async function POST(request: NextRequest) {
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
  }
  const delivered = await sendPushToHousehold(
    context.activeHousehold.id,
    {
      title: 'The Hub',
      body: 'Notifications are working on this device.',
      url: '/settings/notifications',
      tag: 'test',
    },
    parsed.data.endpoint
  );
  return NextResponse.json({ success: true, data: { delivered } });
}
