import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { isPushEndpoint } from '@/lib/notifications/push';

const subscribeSchema = z.object({
  endpoint: z.string().max(2000).refine(isPushEndpoint, 'Not a browser push service address'),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

/** POST /api/push — register this browser/phone for the household's notifications. */
export async function POST(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { endpoint, keys } = parsed.data;
  const data = {
    householdId: context.activeHousehold.id,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  };
  // Re-registering a known device moves it to the active household (a member
  // switching households, or the same phone signed in by the other partner).
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...data },
    update: data,
  });
  return NextResponse.json({ success: true });
}

/** DELETE /api/push — stop notifications on this browser/phone. */
export async function DELETE(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(parsed.error) },
      { status: 400 }
    );
  }
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, householdId: context.activeHousehold.id },
  });
  return NextResponse.json({ success: true });
}
