'use client';

import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/tasks/category-icon';
import { useSetHabitLog, type HabitLogRow, type HabitRow } from '@/lib/hooks/use-habits';
import { addDays } from '@/lib/utils/israel-time';
import {
  dayOfWeek,
  formatTime,
  isOccurrence,
  occurrenceState,
  WEEKDAY_LABELS,
  type HabitLogStatus,
  type OccurrenceState,
} from '@/lib/habits/schedule';
import { STATE_CLASS, STATE_LABEL, logIndex } from './habit-day-list';

const label = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });

export interface DayEntry {
  habit: HabitRow;
  state: OccurrenceState;
  status: HabitLogStatus | undefined;
}

/** A day's scheduled (or answered) habits, earliest first. */
export function dayEntries(
  habits: HabitRow[],
  logs: HabitLogRow[],
  date: string,
  now: Date
): DayEntry[] {
  const byKey = logIndex(logs);
  return habits
    .filter((h) => isOccurrence(h, date) || byKey.has(`${h.id}|${date}`))
    .sort((a, b) => a.timeMinutes - b.timeMinutes)
    .map((h) => {
      const status = byKey.get(`${h.id}|${date}`);
      return { habit: h, status, state: occurrenceState(h, date, status, now) };
    });
}

/**
 * Up next: the first habit still waiting for an answer whose time has come,
 * otherwise the next one coming up. Everything else goes in the timeline.
 */
export function pickUpNext(entries: DayEntry[]) {
  const hero =
    entries.find((e) => !e.status && e.state !== 'upcoming') ??
    entries.find((e) => e.state === 'upcoming');
  return { hero, rest: entries.filter((e) => e !== hero) };
}

/** Seven day pills (Sun–Sat) with a dot per scheduled habit, coloured by state. */
export function HabitWeekStrip({
  weekStart,
  today,
  selected,
  onSelect,
  onShiftWeek,
  entriesFor,
}: {
  weekStart: string;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  onShiftWeek: (weeks: number | 'this') => void;
  entriesFor: (date: string) => DayEntry[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isThisWeek = today >= days[0] && today <= days[6];
  const navBtn =
    'text-muted-foreground hover:text-foreground flex h-11 w-11 items-center justify-center rounded-lg';

  return (
    <div className="border-border/60 border-b pb-4">
      <div className="text-muted-foreground mb-3 flex items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => onShiftWeek(-1)}
            className={navBtn}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums">
            {label(days[0], { month: 'short', day: 'numeric' })} –{' '}
            {label(days[6], { month: 'short', day: 'numeric' })}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => onShiftWeek(1)}
            className={navBtn}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onShiftWeek('this')}
          disabled={isThisWeek}
          className="-mr-2 flex min-h-11 items-center px-2 disabled:cursor-default"
        >
          <span className="bg-muted text-foreground/80 rounded px-2 py-0.5 text-[10px] tracking-wider uppercase">
            This week
          </span>
        </button>
      </div>
      <div className="flex items-center justify-between">
        {days.map((date) => {
          const active = date === selected;
          const entries = entriesFor(date);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={active}
              aria-label={`${label(date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${entries.length} habits`}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-opacity',
                !active && 'opacity-60 hover:opacity-100'
              )}
            >
              <span
                className={cn(
                  'text-[10px] tracking-wider uppercase',
                  active ? 'text-primary font-bold' : 'text-muted-foreground'
                )}
              >
                {WEEKDAY_LABELS[dayOfWeek(date)]}
              </span>
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full tabular-nums',
                  active
                    ? 'bg-primary text-primary-foreground shadow-glow-sm font-bold'
                    : 'text-foreground/80 font-medium',
                  !active && date === today && 'ring-primary/60 ring-1'
                )}
              >
                {Number(date.slice(8))}
              </span>
              <span className="mt-1 flex h-1 gap-0.5">
                {entries.slice(0, 5).map((e) => (
                  <span
                    key={e.habit.id}
                    className={cn(
                      'h-1 w-1 rounded-full',
                      e.state === 'done'
                        ? 'bg-chart-2'
                        : e.state === 'not_done'
                          ? 'bg-destructive'
                          : e.state === 'due'
                            ? 'bg-primary'
                            : 'bg-muted-foreground/50'
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The hero card: the first habit of the day still waiting for an answer. */
export function HabitUpNext({
  entry,
  date,
  onOpen,
}: {
  entry: DayEntry;
  date: string;
  onOpen: (habit: HabitRow) => void;
}) {
  const setLog = useSetHabitLog();
  const { habit: h, state } = entry;
  // Locked while a mark is saving: the optimistic update moves the next
  // habit into this card at once, so a double-tap would mark that one too.
  const open = (state === 'due' || state === 'missed') && !setLog.isPending;
  const mark = (status: HabitLogStatus) => setLog.mutate({ habitId: h.id, date, status });

  return (
    <div className="border-primary/20 from-primary/15 to-card shadow-glow relative mb-8 overflow-hidden rounded-3xl border bg-gradient-to-br p-5">
      <div className="bg-primary/10 pointer-events-none absolute top-0 right-0 -mt-10 -mr-10 h-32 w-32 rounded-full blur-2xl" />
      <button
        type="button"
        onClick={() => onOpen(h)}
        className="relative z-10 mb-6 flex items-center gap-3 text-left"
      >
        <span className="border-primary/30 bg-primary/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border">
          <CategoryIcon name={h.icon} color={h.color} className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xl font-bold">{h.title}</span>
          <span className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
                STATE_CLASS[state]
              )}
            >
              {state === 'due' ? 'Due now' : STATE_LABEL[state]}
            </span>
            <span className="text-muted-foreground text-sm font-medium tabular-nums">
              {formatTime(h.timeMinutes)}
            </span>
          </span>
        </span>
      </button>
      <div className="relative z-10 flex gap-3">
        <button
          type="button"
          disabled={!open}
          onClick={() => mark('NOT_DONE')}
          className="border-border bg-muted/80 text-foreground/80 hover:bg-muted flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors disabled:opacity-40"
        >
          Skip
        </button>
        <button
          type="button"
          disabled={!open}
          onClick={() => mark('DONE')}
          className="bg-primary text-primary-foreground shadow-glow-sm flex-1 rounded-xl py-3 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Complete
        </button>
      </div>
      {!open && (
        <p className="text-muted-foreground relative z-10 mt-3 text-center text-xs">
          You can mark it from {formatTime(h.timeMinutes)}.
        </p>
      )}
    </div>
  );
}

/** Vertical timeline of the day's other habits, each with ✕ / ✓. */
export function HabitTimeline({
  entries,
  date,
  onOpen,
}: {
  entries: DayEntry[];
  date: string;
  onOpen: (habit: HabitRow) => void;
}) {
  const setLog = useSetHabitLog();
  return (
    <div className="border-border relative mb-10 ml-2 border-l-2 pl-4">
      {entries.map(({ habit: h, state, status }) => {
        const open = state !== 'upcoming';
        const toggle = (next: HabitLogStatus) =>
          setLog.mutate({ habitId: h.id, date, status: status === next ? null : next });
        return (
          <div key={h.id} className="relative mb-6 last:mb-0">
            <span
              className={cn(
                'bg-background absolute top-1.5 -left-[23px] h-3 w-3 rounded-full border-2',
                state === 'done'
                  ? 'border-chart-2'
                  : state === 'not_done'
                    ? 'border-destructive'
                    : state === 'due'
                      ? 'border-primary'
                      : 'border-muted-foreground/60'
              )}
            />
            <div className="flex items-start justify-between gap-3 pl-4">
              <button type="button" onClick={() => onOpen(h)} className="min-w-0 text-left">
                <span className="text-muted-foreground mb-1 block text-xs font-bold tabular-nums">
                  {formatTime(h.timeMinutes)}
                </span>
                <span className="flex items-center gap-2">
                  <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4 shrink-0" />
                  <span className="truncate text-base font-semibold">{h.title}</span>
                </span>
                <span className="text-muted-foreground text-xs font-medium">
                  {STATE_LABEL[state]}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label={`Mark ${h.title} not done`}
                  aria-pressed={status === 'NOT_DONE'}
                  disabled={!open}
                  onClick={() => toggle('NOT_DONE')}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-30',
                    status === 'NOT_DONE'
                      ? 'border-destructive bg-destructive/20 text-destructive'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
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
                    'flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-30',
                    status === 'DONE'
                      ? 'border-chart-2 bg-chart-2/20 text-chart-2'
                      : 'border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50'
                  )}
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
