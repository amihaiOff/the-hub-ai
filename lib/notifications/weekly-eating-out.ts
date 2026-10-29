import { prisma } from '@/lib/db';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { sendPushToHousehold } from './push';

/**
 * Saturday-evening push: what the household spent eating out this week
 * (Sunday–Saturday, Israel time), from the categories below.
 */
export const EATING_OUT_CATEGORIES = ['Wolt', 'Restaurant'];
const SEND_HOUR = 20; // 20:00 Israel time, Saturday
const LOG_TYPE = 'weekly_eating_out';

/** Israel-local date parts for `now` (DST-aware). */
export function israelNow(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    hour: Number(parts.hour),
  };
}

const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Sunday–Saturday containing `date` (YYYY-MM-DD, Israel-local). */
export function weekOf(date: string, weekday: number) {
  const start = addDays(date, -weekday);
  return { start, end: addDays(start, 6) };
}

/** Is it time to send? Saturday, 20:00–20:59 Israel time. */
export function isSendTime(now: Date): boolean {
  const t = israelNow(now);
  return t.weekday === 6 && t.hour === SEND_HOUR;
}

async function spendByCategory(
  householdId: string,
  categoryIds: string[],
  from: string,
  to: string
) {
  const rows = await prisma.budgetTransaction.groupBy({
    by: ['categoryId'],
    where: {
      householdId,
      type: 'expense',
      categoryId: { in: categoryIds },
      transactionDate: { gte: new Date(from), lte: new Date(to) },
      isDeleted: false,
      isSplit: false,
      excludedFromFlow: false,
      OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
    },
    _sum: { amountIls: true },
  });
  return new Map(rows.map((r) => [r.categoryId, Number(r._sum.amountIls ?? 0)]));
}

/**
 * Send this week's eating-out summary to one household, once per week
 * (recorded in Labs → Activity, which is also the de-duplication key).
 * Returns false when skipped (already sent, or no eating-out categories).
 */
export async function sendWeeklyEatingOut(householdId: string, now: Date): Promise<boolean> {
  const t = israelNow(now);
  const week = weekOf(t.date, t.weekday);

  const already = await prisma.generalLog.findFirst({
    where: { householdId, type: LOG_TYPE, subjectId: week.start },
    select: { id: true },
  });
  if (already) return false;

  const categories = await prisma.budgetCategory.findMany({
    where: { householdId, name: { in: EATING_OUT_CATEGORIES, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (categories.length === 0) return false;
  const ids = categories.map((c) => c.id);

  const [thisWeek, lastWeek] = await Promise.all([
    spendByCategory(householdId, ids, week.start, week.end),
    spendByCategory(
      householdId,
      ids,
      weekOf(addDays(week.start, -1), 6).start,
      addDays(week.start, -1)
    ),
  ]);
  const total = [...thisWeek.values()].reduce((a, b) => a + b, 0);
  const lastTotal = [...lastWeek.values()].reduce((a, b) => a + b, 0);
  const breakdown = categories
    .map((c) => `${c.name} ${formatCurrencyILS(thisWeek.get(c.id) ?? 0)}`)
    .join(' · ');

  const title = `Eating out this week: ${formatCurrencyILS(total)}`;
  const body = `${breakdown}. Last week ${formatCurrencyILS(lastTotal)}.`;
  await sendPushToHousehold(householdId, {
    title,
    body,
    url: '/budget/transactions',
    tag: 'weekly-eating-out',
  });
  await prisma.generalLog.create({
    data: {
      householdId,
      type: LOG_TYPE,
      subjectType: 'weekly_summary',
      subjectId: week.start,
      description: `${title} (${week.start} – ${week.end}). ${body}`,
      readAt: new Date(),
    },
  });
  return true;
}
