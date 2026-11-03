import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronLog } from '@/lib/utils/cron-logger';
import { sendPushToHousehold } from '@/lib/notifications/push';
import { formatTime, isOccurrence, israelClock } from '@/lib/habits/schedule';
import { serializeHabit, ymdToDate } from '@/lib/habits/serialize';

/** A reminder more than this late (e.g. the timer was down) is skipped, not sent. */
const MAX_LATE_MINUTES = 120;

/**
 * GET /api/cron/habit-reminders — pushes each habit's reminder at its time.
 *
 * Not in vercel.json: Hobby crons run at most daily and anywhere within the
 * hour, so an outside timer (cron-job.org) calls this every 5 minutes with
 * `Authorization: Bearer $CRON_SECRET`. Each habit is claimed for the day
 * with one conditional UPDATE before sending, so overlapping or repeated runs
 * send at most one reminder per habit per day.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const { today, weekday, minutes } = israelClock(now);
  const candidates = (
    await prisma.habit.findMany({
      where: {
        notify: true,
        archivedAt: null,
        weekdays: { has: weekday },
        timeMinutes: { lte: minutes, gte: minutes - MAX_LATE_MINUTES },
        OR: [{ lastNotifiedOn: null }, { lastNotifiedOn: { not: ymdToDate(today) } }],
        // Already answered today (e.g. from the page) — no reminder needed.
        logs: { none: { date: ymdToDate(today) } },
      },
    })
  ).filter((h) => isOccurrence(serializeHabit(h), today));

  // Runs every 5 minutes — only log the runs that had something to send, so
  // cron_run_logs doesn't gain ~288 empty rows a day.
  if (candidates.length === 0) return NextResponse.json({ success: true, sent: 0 });

  return withCronLog('/api/cron/habit-reminders', async () => {
    const sent: string[] = [];
    const failed: { habitId: string; error: string }[] = [];
    for (const h of candidates) {
      try {
        // Atomic claim (raw SQL: updateMany silently no-ops on the Neon adapter).
        const claimed = await prisma.$executeRaw`
          UPDATE habits SET last_notified_on = ${today}::date
          WHERE id = ${h.id} AND last_notified_on IS DISTINCT FROM ${today}::date`;
        if (claimed !== 1) continue;
        await sendPushToHousehold(
          h.householdId,
          {
            title: h.title,
            body: `Scheduled for ${formatTime(h.timeMinutes)} — done?`,
            url: '/habits',
            tag: `habit-${h.id}`,
            actions: [
              { action: 'done', title: 'Done' },
              { action: 'not_done', title: 'Not done' },
            ],
            data: { habitId: h.id, date: today },
          },
          { userId: h.ownerId }
        );
        sent.push(h.id);
      } catch (err) {
        failed.push({ habitId: h.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { body: { success: failed.length === 0, sent, failed } };
  });
}
