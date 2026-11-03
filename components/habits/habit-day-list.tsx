'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/tasks/category-icon';
import {
  useHabitLogs,
  useHabits,
  useSetHabitLog,
  type HabitLogRow,
  type HabitRow,
} from '@/lib/hooks/use-habits';
import {
  formatTime,
  isOccurrence,
  israelClock,
  occurrenceState,
  type OccurrenceState,
} from '@/lib/habits/schedule';

/** Current time, re-rendered every minute so "upcoming" turns "due" on its own. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** State → token classes. Shared with the calendar so both read the same. */
export const STATE_CLASS: Record<OccurrenceState, string> = {
  done: 'bg-chart-2/20 text-chart-2',
  not_done: 'bg-destructive/20 text-destructive',
  due: 'bg-primary/15 text-primary',
  missed: 'bg-muted text-muted-foreground',
  upcoming: 'bg-muted/40 text-muted-foreground opacity-60',
};

export const STATE_LABEL: Record<OccurrenceState, string> = {
  done: 'Done',
  not_done: 'Not done',
  due: 'Due',
  missed: 'Missed',
  upcoming: 'Upcoming',
};

export const logIndex = (logs: HabitLogRow[]) =>
  new Map(logs.map((l) => [`${l.habitId}|${l.date}`, l.status]));

/**
 * One day's scheduled habits with Done / Not done buttons. The buttons only
 * work once the habit's time has arrived; pressing the active one clears it.
 */
export function HabitDayList({
  date,
  habits,
  logs,
  now,
  onOpenHabit,
}: {
  date: string;
  habits: HabitRow[];
  logs: HabitLogRow[];
  now: Date;
  onOpenHabit?: (habit: HabitRow) => void;
}) {
  const setLog = useSetHabitLog();
  const byKey = logIndex(logs);
  const items = habits
    .filter((h) => isOccurrence(h, date) || byKey.has(`${h.id}|${date}`))
    .sort((a, b) => a.timeMinutes - b.timeMinutes);

  if (items.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">No habits scheduled.</p>;
  }

  return (
    <ul className="divide-border/60 divide-y">
      {items.map((h) => {
        const status = byKey.get(`${h.id}|${date}`);
        const state = occurrenceState(h, date, status, now);
        const open = state !== 'upcoming';
        const toggle = (next: 'DONE' | 'NOT_DONE') =>
          setLog.mutate({ habitId: h.id, date, status: status === next ? null : next });
        return (
          <li key={h.id} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                STATE_CLASS[state]
              )}
            >
              <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => onOpenHabit?.(h)}
              disabled={!onOpenHabit}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-medium">{h.title}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatTime(h.timeMinutes)} · {STATE_LABEL[state]}
              </span>
            </button>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                aria-label={`Mark ${h.title} not done`}
                aria-pressed={status === 'NOT_DONE'}
                disabled={!open}
                onClick={() => toggle('NOT_DONE')}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-30',
                  status === 'NOT_DONE'
                    ? 'border-destructive bg-destructive/20 text-destructive'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Mark ${h.title} done`}
                aria-pressed={status === 'DONE'}
                disabled={!open}
                onClick={() => toggle('DONE')}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-30',
                  status === 'DONE'
                    ? 'border-chart-2 bg-chart-2/20 text-chart-2'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Today's habits (Israel day). Used by the dashboard card and the mobile page. */
export function useTodayHabits() {
  const now = useNow();
  const today = israelClock(now).today;
  const habits = useHabits();
  const logs = useHabitLogs(today, today);
  const scheduled = (habits.data ?? []).filter((h) => isOccurrence(h, today));
  return { now, today, habits, logs, scheduled };
}
