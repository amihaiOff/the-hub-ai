'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdateTask, type TaskRow } from '@/lib/hooks/use-tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { CategoryIcon } from './category-icon';
import { PriorityBadge } from './task-list-view';

type CalendarMode = 'month' | 'week';

interface TaskCalendarViewProps {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  /** Create a task due on the given day, then open it. */
  onAddTaskOnDate: (dueDateIso: string) => void;
}

// Fallback dot colour when a task has no (valid) category colour — keyed by
// status so the calendar still communicates state at a glance.
const STATUS_DOT: Record<TaskRow['status'], string> = {
  TODO: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  BLOCKED: '#f59e0b',
  DONE: '#10b981',
  CANCELLED: '#6b7280',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_DOTS = 4;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar-day key so a task lands on the day the user sees. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isHexColor = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);
const dotColor = (t: TaskRow) =>
  isHexColor(t.category?.color) ? t.category!.color! : STATUS_DOT[t.status];
/** Subtle chip background from the category colour, else undefined (muted). */
const tintColor = (t: TaskRow) =>
  isHexColor(t.category?.color) ? `${t.category!.color!}22` : undefined;

const startOfWeek = (d: Date) => {
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay());
  return s;
};

/**
 * Calendar of tasks with a due date, in either a Month or a Week view.
 *
 * Month view: each day cell shows a coloured dot per due task; tapping a day
 * lists its tasks in the agenda below (open / toggle done). Week view: seven
 * day columns (stacked on mobile) where each task shows as a titled chip.
 * Tasks without a due date are collected in a separate section either way.
 */
export function TaskCalendarView({ tasks, onOpenTask, onAddTaskOnDate }: TaskCalendarViewProps) {
  const today = useMemo(() => new Date(), []);
  const [mode, setModeState] = useState<CalendarMode>('month');
  // Anchor date for the visible range: the 1st of the month in month mode, any
  // day within the week in week mode.
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedKey, setSelectedKey] = useState(() => dayKey(today));

  // Bucket tasks by their date-only due prefix (the detail sheet round-trips on
  // the `YYYY-MM-DD` prefix), and collect the undated ones separately.
  const { byDay, undated } = useMemo(() => {
    const byDay = new Map<string, TaskRow[]>();
    const undated: TaskRow[] = [];
    for (const t of tasks) {
      if (!t.dueDate) {
        undated.push(t);
        continue;
      }
      const key = t.dueDate.slice(0, 10);
      const list = byDay.get(key);
      if (list) list.push(t);
      else byDay.set(key, [t]);
    }
    return { byDay, undated };
  }, [tasks]);

  // Month grid: 6 weeks × 7 days, starting on the Sunday on/before the 1st.
  const gridDays = useMemo(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewDate]);

  // Week columns: the seven days of the anchor's week.
  const weekDays = useMemo(() => {
    const s = startOfWeek(viewDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const setMode = (next: CalendarMode) => {
    // Keep context across the toggle by anchoring on the selected day.
    const sel = keyToDate(selectedKey);
    setViewDate(next === 'month' ? new Date(sel.getFullYear(), sel.getMonth(), 1) : sel);
    setModeState(next);
  };

  const goPrev = () => {
    if (mode === 'month') {
      const next = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      setViewDate(next);
      setSelectedKey(dayKey(next));
    } else {
      const next = new Date(viewDate);
      next.setDate(viewDate.getDate() - 7);
      setViewDate(next);
    }
  };

  const goNext = () => {
    if (mode === 'month') {
      const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      setViewDate(next);
      setSelectedKey(dayKey(next));
    } else {
      const next = new Date(viewDate);
      next.setDate(viewDate.getDate() + 7);
      setViewDate(next);
    }
  };

  const goToToday = () => {
    setViewDate(
      mode === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today)
    );
    setSelectedKey(dayKey(today));
  };

  const todayKey = dayKey(today);
  const title =
    mode === 'month'
      ? viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : weekRangeLabel(weekDays[0], weekDays[6]);

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={goToToday}
            className="border-border/60 hover:bg-muted/60 mr-1 rounded-xl border px-3 py-1.5 text-xs font-medium"
          >
            {mode === 'month' ? 'Today' : 'This week'}
          </button>
          <button
            type="button"
            onClick={goPrev}
            aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}
            className="border-border/60 hover:bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl border"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={mode === 'month' ? 'Next month' : 'Next week'}
            className="border-border/60 hover:bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl border"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Week / Month toggle */}
      <div className="border-border/60 bg-muted/30 flex rounded-xl border p-0.5">
        {(['week', 'month'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition-colors',
              mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'month' ? (
        <MonthGrid
          gridDays={gridDays}
          byDay={byDay}
          currentMonth={viewDate.getMonth()}
          todayKey={todayKey}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onOpenTask={onOpenTask}
          onAddTaskOnDate={onAddTaskOnDate}
        />
      ) : (
        <WeekColumns
          weekDays={weekDays}
          byDay={byDay}
          todayKey={todayKey}
          onOpenTask={onOpenTask}
          onAddTaskOnDate={onAddTaskOnDate}
        />
      )}

      {/* Tasks with no due date — surfaced so the calendar never hides them. */}
      {undated.length > 0 && (
        <details className="border-border/40 border-t pt-4">
          <summary className="text-muted-foreground cursor-pointer text-sm font-semibold select-none">
            No due date ({undated.length})
          </summary>
          <div className="mt-2 space-y-2">
            {undated.map((task) => (
              <AgendaRow key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MonthGrid({
  gridDays,
  byDay,
  currentMonth,
  todayKey,
  selectedKey,
  onSelect,
  onOpenTask,
  onAddTaskOnDate,
}: {
  gridDays: Date[];
  byDay: Map<string, TaskRow[]>;
  currentMonth: number;
  todayKey: string;
  selectedKey: string;
  onSelect: (key: string) => void;
  onOpenTask: (id: string) => void;
  onAddTaskOnDate: (iso: string) => void;
}) {
  const selectedTasks = byDay.get(selectedKey) ?? [];
  const selectedDate = keyToDate(selectedKey);

  return (
    <>
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-muted-foreground py-1 text-center text-xs font-medium">
            <span className="sm:hidden">{wd[0]}</span>
            <span className="hidden sm:inline">{wd}</span>
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((date) => {
          const key = dayKey(date);
          const dayTasks = byDay.get(key) ?? [];
          const inMonth = date.getMonth() === currentMonth;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${
                dayTasks.length
                  ? `, ${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}`
                  : ''
              }`}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-14 flex-col items-center gap-1 rounded-xl border p-1 transition-colors sm:min-h-16',
                inMonth ? 'border-border/50' : 'border-transparent opacity-40',
                isSelected ? 'border-primary ring-primary/40 ring-2' : 'hover:bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground'
                )}
              >
                {date.getDate()}
              </span>
              {dayTasks.length > 0 && (
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {dayTasks.slice(0, MAX_DOTS).map((t) => (
                    <span
                      key={t.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: dotColor(t) }}
                    />
                  ))}
                  {dayTasks.length > MAX_DOTS && (
                    <span className="text-muted-foreground text-[9px] leading-none">
                      +{dayTasks.length - MAX_DOTS}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Agenda for the selected day */}
      <div className="border-border/40 space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </h3>
          <button
            type="button"
            // Same date-only format the detail sheet writes, so the new task
            // lands on the tapped day regardless of timezone.
            onClick={() => onAddTaskOnDate(`${selectedKey}T00:00:00.000Z`)}
            aria-label="Add task on this day"
            className="text-primary hover:bg-primary/10 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {selectedTasks.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-sm">No tasks due.</p>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((task) => (
              <AgendaRow key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function WeekColumns({
  weekDays,
  byDay,
  todayKey,
  onOpenTask,
  onAddTaskOnDate,
}: {
  weekDays: Date[];
  byDay: Map<string, TaskRow[]>;
  todayKey: string;
  onOpenTask: (id: string) => void;
  onAddTaskOnDate: (iso: string) => void;
}) {
  return (
    // One stacked column per day on mobile; seven side-by-side on desktop.
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {weekDays.map((date) => {
        const key = dayKey(date);
        const dayTasks = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <div
            key={key}
            className={cn(
              'rounded-xl border p-2 sm:min-h-28',
              isToday ? 'border-primary/50 bg-primary/5' : 'border-border/50'
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-1">
              <span className={cn('text-xs font-medium', isToday && 'text-primary')}>
                {date.toLocaleDateString(undefined, { weekday: 'short' })} {date.getDate()}
              </span>
              <button
                type="button"
                onClick={() => onAddTaskOnDate(`${key}T00:00:00.000Z`)}
                aria-label={`Add task on ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                className="text-muted-foreground hover:text-primary hover:bg-primary/10 flex h-6 w-6 items-center justify-center rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {dayTasks.map((task) => (
                <WeekChip key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
              ))}
              {dayTasks.length === 0 && (
                <p className="text-muted-foreground/60 py-1 text-center text-xs">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekChip({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const isDone = task.status === 'DONE';
  const tint = tintColor(task);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={task.title}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-colors',
        !tint && 'bg-muted/50 hover:bg-muted'
      )}
      style={tint ? { backgroundColor: tint } : undefined}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor(task) }}
      />
      <span className={cn('truncate', isDone && 'text-muted-foreground line-through')}>
        {task.title}
      </span>
    </button>
  );
}

function AgendaRow({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const update = useUpdateTask();
  const isDone = task.status === 'DONE';

  return (
    <div
      onClick={onOpen}
      className="border-border/60 bg-card hover:border-border flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors"
    >
      <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isDone}
          onCheckedChange={(v) =>
            update.mutate({ id: task.id, patch: { status: v === true ? 'DONE' : 'TODO' } })
          }
          className="h-5 w-5 rounded-md"
          aria-label={isDone ? 'Mark task as not done' : 'Mark task as done'}
        />
      </span>
      {task.category && (
        <CategoryIcon
          name={task.category.icon}
          color={task.category.color}
          className="h-4 w-4 shrink-0"
        />
      )}
      {/* A focusable button (not a plain span) so keyboard users can open the
          task, matching the list and kanban card views. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className={cn(
          'flex-1 truncate text-left text-sm font-medium',
          isDone && 'text-muted-foreground line-through'
        )}
      >
        {task.title}
      </button>
      <PriorityBadge priority={task.priority} />
    </div>
  );
}

/** e.g. "Jul 6 – 12, 2026", "Jun 29 – Jul 5, 2026", or spanning years. */
function weekRangeLabel(start: Date, end: Date): string {
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  if (sameMonth) return `${m(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  if (sameYear) {
    return `${m(start)} ${start.getDate()} – ${m(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${m(start)} ${start.getDate()}, ${start.getFullYear()} – ${m(end)} ${end.getDate()}, ${end.getFullYear()}`;
}
