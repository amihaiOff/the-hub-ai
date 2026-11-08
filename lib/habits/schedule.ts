import { addDays, israelNow } from '@/lib/utils/israel-time';

/**
 * Habit schedule maths. Everything is in Israel-local days ("YYYY-MM-DD")
 * so the server cron, the API guard and the UI agree on what "today" is.
 * Shared by server and client — keep it pure.
 */

export interface HabitSchedule {
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  timeMinutes: number; // minutes after midnight
  intervalWeeks: number; // 1–4
  startDate: string; // YYYY-MM-DD, the Israel day the habit was created
  archivedAt: string | null; // ISO timestamp
}

export type OccurrenceState = 'done' | 'not_done' | 'due' | 'missed' | 'upcoming';
export type HabitLogStatus = 'DONE' | 'NOT_DONE';

const DAY_MS = 86_400_000;
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const dayOfWeek = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
export const sundayOf = (ymd: string) => addDays(ymd, -dayOfWeek(ymd));

/** Israel "now": the local day plus minutes after midnight. */
export function israelClock(now: Date) {
  const t = israelNow(now);
  // Israel's offset is whole hours, so the minute matches UTC's.
  return { today: t.date, weekday: t.weekday, minutes: t.hour * 60 + now.getUTCMinutes() };
}

/** Israel-local day of an instant (e.g. when a habit was archived). */
export const israelDay = (iso: string | Date) => israelNow(new Date(iso)).date;

/** Is `ymd` one of the habit's scheduled days? */
export function isOccurrence(h: HabitSchedule, ymd: string): boolean {
  if (ymd < h.startDate) return false;
  // Archived habits stop producing days from the day they were archived.
  if (h.archivedAt && ymd >= israelDay(h.archivedAt)) return false;
  if (!h.weekdays.includes(dayOfWeek(ymd))) return false;
  const weeks = Math.round(
    (Date.parse(sundayOf(ymd)) - Date.parse(sundayOf(h.startDate))) / (7 * DAY_MS)
  );
  return weeks % h.intervalWeeks === 0;
}

/** Scheduled days from `from` to `to` inclusive. */
export function occurrencesInRange(h: HabitSchedule, from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isOccurrence(h, d)) out.push(d);
  return out;
}

/** Has this scheduled day's time arrived? (Marking is only allowed from then on.) */
export function canMark(h: HabitSchedule, ymd: string, now: Date): boolean {
  if (!isOccurrence(h, ymd)) return false;
  const c = israelClock(now);
  return ymd < c.today || (ymd === c.today && c.minutes >= h.timeMinutes);
}

export function occurrenceState(
  h: HabitSchedule,
  ymd: string,
  log: HabitLogStatus | undefined,
  now: Date
): OccurrenceState {
  if (log === 'DONE') return 'done';
  if (log === 'NOT_DONE') return 'not_done';
  const c = israelClock(now);
  if (ymd < c.today) return 'missed';
  return canMark(h, ymd, now) ? 'due' : 'upcoming';
}

/** The next scheduled day whose time hasn't come yet, or null (archived). */
export function nextOccurrence(h: HabitSchedule, now: Date): string | null {
  const c = israelClock(now);
  // One full cycle (≤ 4 weeks) plus a week always contains the next slot.
  for (let i = 0, d = c.today; i < 36; i++, d = addDays(d, 1)) {
    if (isOccurrence(h, d) && !(d === c.today && c.minutes >= h.timeMinutes)) return d;
  }
  return null;
}

export const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "Every 2 weeks · Mon, Thu 08:00" */
export function formatSchedule(
  h: Pick<HabitSchedule, 'weekdays' | 'timeMinutes' | 'intervalWeeks'>
) {
  if (h.intervalWeeks === 1 && new Set(h.weekdays).size === 7) {
    return `Every day ${formatTime(h.timeMinutes)}`;
  }
  const every = h.intervalWeeks === 1 ? 'Every week' : `Every ${h.intervalWeeks} weeks`;
  const days = [...h.weekdays]
    .sort()
    .map((d) => WEEKDAY_LABELS[d])
    .join(', ');
  return `${every} · ${days} ${formatTime(h.timeMinutes)}`;
}
