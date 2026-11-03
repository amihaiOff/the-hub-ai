'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/tasks/category-icon';
import { useHabitLogs, type HabitRow } from '@/lib/hooks/use-habits';
import { addDays } from '@/lib/utils/israel-time';
import { isOccurrence, israelClock, occurrenceState, WEEKDAY_LABELS } from '@/lib/habits/schedule';
import { HabitDayList, STATE_CLASS, logIndex } from './habit-day-list';

export type HabitCalendarMode = 'week' | 'month';

const MAX_MONTH_ICONS = 4;
const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const sunday = (ymd: string) => addDays(ymd, -dow(ymd));
const monthStart = (ymd: string) => `${ymd.slice(0, 8)}01`;
const shiftMonth = (ymd: string, n: number) => {
  const d = new Date(`${monthStart(ymd)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const label = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });

/**
 * Week / month calendar of habit days, coloured by state. Tapping a day opens
 * its list below the grid, where it can be marked (once its time has come).
 */
export function HabitCalendar({
  mode,
  onModeChange,
  habits,
  archivedIds,
  now,
}: {
  mode: HabitCalendarMode;
  onModeChange: (mode: HabitCalendarMode) => void;
  /** Active + archived habits. */
  habits: HabitRow[];
  archivedIds: Set<string>;
  now: Date;
}) {
  const today = israelClock(now).today;
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [filter, setFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);

  const days = useMemo(() => {
    const start = mode === 'week' ? sunday(anchor) : sunday(monthStart(anchor));
    return Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => addDays(start, i));
  }, [mode, anchor]);
  const from = days[0];
  const to = days[days.length - 1];
  const logsQuery = useHabitLogs(from, to);
  const byKey = useMemo(() => logIndex(logsQuery.data ?? []), [logsQuery.data]);

  const visible = habits.filter((h) => filter === 'all' || h.id === filter);

  const entriesFor = (date: string) =>
    visible
      .filter((h) => isOccurrence(h, date) || byKey.has(`${h.id}|${date}`))
      .sort((a, b) => a.timeMinutes - b.timeMinutes)
      .map((h) => ({
        habit: h,
        state: occurrenceState(h, date, byKey.get(`${h.id}|${date}`), now),
        faded: archivedIds.has(h.id) && !showArchived,
      }));

  // Keep the selected day inside the visible range (its logs are loaded with it).
  const step = (n: number) => {
    const next = mode === 'week' ? addDays(anchor, 7 * n) : shiftMonth(anchor, n);
    setAnchor(next);
    setSelected(mode === 'week' ? addDays(selected, 7 * n) : next);
  };
  const title =
    mode === 'month'
      ? label(monthStart(anchor), { month: 'long', year: 'numeric' })
      : `${label(from, { month: 'short', day: 'numeric' })} – ${label(to, { month: 'short', day: 'numeric' })}`;

  const navBtn =
    'border-border/60 hover:bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl border';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setAnchor(today);
              setSelected(today);
            }}
            className="border-border/60 hover:bg-muted/60 mr-1 rounded-xl border px-3 py-1.5 text-xs font-medium"
          >
            Today
          </button>
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className={navBtn}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next" onClick={() => step(1)} className={navBtn}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="bg-muted/60 flex rounded-xl p-0.5" role="group" aria-label="Calendar view">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => onModeChange(m)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium capitalize',
                mode === m ? 'bg-card text-foreground shadow-glow-sm' : 'text-muted-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter habits"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border-border bg-card h-8 max-w-[11rem] rounded-xl border px-2 text-xs"
        >
          <option value="all">All habits</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.title}
              {archivedIds.has(h.id) ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        {archivedIds.size > 0 && (
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-muted-foreground pb-1 text-center text-[11px] font-medium">
            {d}
          </div>
        ))}
        {days.map((date) => {
          const entries = entriesFor(date);
          const shown = mode === 'month' ? entries.slice(0, MAX_MONTH_ICONS) : entries;
          const outside = mode === 'month' && date.slice(0, 7) !== anchor.slice(0, 7);
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelected(date)}
              aria-label={`${label(date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${entries.length} habits`}
              aria-pressed={selected === date}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-1 transition-colors',
                mode === 'week' ? 'min-h-28' : 'min-h-16',
                selected === date ? 'border-primary' : 'hover:bg-muted/40 border-transparent',
                outside && 'opacity-40'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                  date === today && 'bg-primary text-primary-foreground font-semibold'
                )}
              >
                {Number(date.slice(8))}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {shown.map(({ habit, state, faded }) => (
                  <span
                    key={habit.id}
                    title={`${habit.title}: ${state.replace('_', ' ')}`}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md',
                      STATE_CLASS[state],
                      faded && 'opacity-40'
                    )}
                  >
                    <CategoryIcon name={habit.icon} className="h-3 w-3" />
                  </span>
                ))}
                {entries.length > shown.length && (
                  <span className="text-muted-foreground text-[10px]">
                    +{entries.length - shown.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border/60 border-t pt-3">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label(selected, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        <HabitDayList date={selected} habits={visible} logs={logsQuery.data ?? []} now={now} />
      </div>
    </div>
  );
}
