import type { Habit } from '@prisma/client';

/** A DB `@db.Date` column → "YYYY-MM-DD". */
export const dateToYmd = (d: Date) => d.toISOString().slice(0, 10);
/** "YYYY-MM-DD" → a Date at UTC midnight, for `@db.Date` columns. */
export const ymdToDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export interface HabitRow {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  notify: boolean;
  weekdays: number[];
  timeMinutes: number;
  intervalWeeks: number;
  startDate: string;
  sortOrder: number;
  archivedAt: string | null;
}

export function serializeHabit(h: Habit): HabitRow {
  return {
    id: h.id,
    title: h.title,
    icon: h.icon,
    color: h.color,
    notify: h.notify,
    weekdays: h.weekdays,
    timeMinutes: h.timeMinutes,
    intervalWeeks: h.intervalWeeks,
    startDate: dateToYmd(h.startDate),
    sortOrder: h.sortOrder,
    archivedAt: h.archivedAt?.toISOString() ?? null,
  };
}
