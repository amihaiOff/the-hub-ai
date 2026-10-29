import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronLog } from '@/lib/utils/cron-logger';
import { isSendTime, sendWeeklyEatingOut } from '@/lib/notifications/weekly-eating-out';

/**
 * GET /api/cron/weekly-eating-out — Saturday at 20:00 Israel time.
 *
 * Vercel crons run in UTC and Hobby fires anywhere within the scheduled hour,
 * so vercel.json schedules this at both 17:00 and 18:00 UTC on Saturdays
 * (20:00 Israel in summer and winter). Only the run that lands in the 20:00
 * Israel hour sends; the weekly Activity entry stops a second send.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return withCronLog('/api/cron/weekly-eating-out', async () => {
    const now = new Date();
    if (!isSendTime(now))
      return { body: { success: true, skipped: 'not 20:00 Saturday in Israel' } };

    const households = await prisma.household.findMany({
      where: { pushSubscriptions: { some: {} } },
      select: { id: true },
    });
    const sent: string[] = [];
    for (const h of households) {
      if (await sendWeeklyEatingOut(h.id, now)) sent.push(h.id);
    }
    return { body: { success: true, sent } };
  });
}
