import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronLog } from '@/lib/utils/cron-logger';
import { isSendTime, sendWeeklyEatingOut } from '@/lib/notifications/weekly-eating-out';
import { syncMoneytorForHouseholdAndLog } from '@/lib/api/moneytor-sync';

// Room for a fresh bank sync before adding up the week.
export const maxDuration = 120;

/**
 * GET /api/cron/weekly-eating-out — Saturday at 20:00 Israel time.
 *
 * Vercel crons run in UTC and Hobby fires anywhere within the scheduled hour,
 * so vercel.json schedules this at both 17:00 and 18:00 UTC on Saturdays
 * (20:00 Israel in summer and winter). Only the run that lands in the 20:00
 * Israel hour sends; the weekly Activity entry stops a second send. The
 * `?utc=17|18` in vercel.json only keeps the two cron entries distinct.
 *
 * The daily bank sync runs in the morning, so the week's last two days
 * wouldn't be in yet — each household is synced first (best-effort).
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
    const failed: { householdId: string; error: string }[] = [];
    for (const h of households) {
      try {
        if (process.env.MONEYTOR_API_TOKEN) {
          await syncMoneytorForHouseholdAndLog(h.id, 'cron').catch((err) =>
            console.error(`Pre-summary Moneytor sync failed for ${h.id}:`, err)
          );
        }
        if (await sendWeeklyEatingOut(h.id, now)) sent.push(h.id);
      } catch (err) {
        // One household's failure mustn't cost the others their summary.
        failed.push({ householdId: h.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { body: { success: failed.length === 0, sent, failed } };
  });
}
