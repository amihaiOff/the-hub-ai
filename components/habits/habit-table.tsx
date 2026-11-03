'use client';

import { Bell, Check, GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/tasks/category-icon';
import {
  useReorderHabits,
  useSetHabitLog,
  type HabitLogRow,
  type HabitRow,
} from '@/lib/hooks/use-habits';
import {
  formatSchedule,
  israelClock,
  nextOccurrence,
  occurrenceState,
} from '@/lib/habits/schedule';
import { logIndex } from './habit-day-list';

const nextLabel = (ymd: string | null, today: string) => {
  if (!ymd) return '—';
  if (ymd === today) return 'Today';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// Icon · Title (+ schedule on mobile) · Schedule · 🔔 · Next · ✓
const ROW_GRID =
  'grid grid-cols-[1.25rem_2.25rem_1fr_auto] items-center gap-3 md:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_minmax(0,1.3fr)_1.5rem_6rem_2.75rem]';

/** Active habits: drag to reorder (mouse drag, or long-press on touch). */
export function ActiveHabitTable({
  habits,
  todayLogs,
  now,
  onOpen,
}: {
  habits: HabitRow[];
  todayLogs: HabitLogRow[];
  now: Date;
  onOpen: (habit: HabitRow) => void;
}) {
  const reorder = useReorderHabits();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = habits.map((h) => h.id);
    reorder.mutate(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const today = israelClock(now).today;
  const byKey = logIndex(todayLogs);

  return (
    <div role="table" aria-label="Habits">
      <div
        role="row"
        className={cn(
          ROW_GRID,
          'text-muted-foreground hidden border-b px-2 pb-2 text-xs font-medium md:grid'
        )}
      >
        <span />
        <span role="columnheader" className="sr-only">
          Icon
        </span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Schedule</span>
        <span role="columnheader" className="sr-only">
          Notifications
        </span>
        <span role="columnheader">Next</span>
        <span role="columnheader" className="sr-only">
          Done today
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
          {habits.map((h) => (
            <SortableHabitRow
              key={h.id}
              habit={h}
              today={today}
              status={byKey.get(`${h.id}|${today}`)}
              now={now}
              onOpen={() => onOpen(h)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableHabitRow({
  habit: h,
  today,
  status,
  now,
  onOpen,
}: {
  habit: HabitRow;
  today: string;
  status: HabitLogRow['status'] | undefined;
  now: Date;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: h.id,
  });
  const setLog = useSetHabitLog();
  const state = occurrenceState(h, today, status, now);
  const schedule = formatSchedule(h);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="row"
      onClick={onOpen}
      className={cn(
        ROW_GRID,
        'border-border/60 hover:bg-muted/40 cursor-pointer touch-manipulation border-b px-2 py-2.5 select-none last:border-b-0',
        isDragging && 'bg-card shadow-glow-lg relative z-10 rounded-xl'
      )}
    >
      <GripVertical className="text-muted-foreground/60 h-4 w-4" aria-hidden />
      <span role="cell" className="bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl">
        <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4" />
      </span>
      <span role="cell" className="min-w-0">
        {/* A real button so keyboard users can open the habit (Enter on the
            row itself is taken by the drag sensor). */}
        <button
          type="button"
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-full truncate text-left text-sm font-medium"
        >
          {h.title}
        </button>
        <span className="text-muted-foreground block truncate text-xs md:hidden">
          {h.notify && <Bell className="mr-1 inline h-3 w-3" aria-label="Notifications on" />}
          {schedule}
        </span>
      </span>
      <span role="cell" className="text-muted-foreground hidden truncate text-sm md:block">
        {schedule}
      </span>
      <span role="cell" className="hidden md:block">
        {h.notify && (
          <Bell className="text-muted-foreground h-4 w-4" aria-label="Notifications on" />
        )}
      </span>
      <span role="cell" className="text-muted-foreground hidden text-sm tabular-nums md:block">
        {nextLabel(nextOccurrence(h, now), today)}
      </span>
      <span role="cell" className="flex justify-end">
        {(state === 'due' || state === 'done') && (
          <button
            type="button"
            aria-label={state === 'done' ? `Unmark ${h.title}` : `Mark ${h.title} done`}
            aria-pressed={state === 'done'}
            // Don't open the sheet or start a drag from the check button.
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setLog.mutate({
                habitId: h.id,
                date: today,
                status: state === 'done' ? null : 'DONE',
              });
            }}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
              state === 'done'
                ? 'border-chart-2 bg-chart-2/20 text-chart-2'
                : 'border-primary text-primary hover:bg-primary/15'
            )}
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  );
}

/** Archived habits: most recently archived first, restore or delete for good. */
export function ArchivedHabitTable({
  habits,
  onRestore,
  onDelete,
}: {
  habits: HabitRow[];
  onRestore: (habit: HabitRow) => void;
  onDelete: (habit: HabitRow) => void;
}) {
  return (
    <ul aria-label="Archived habits">
      {habits.map((h) => (
        <li
          key={h.id}
          className="border-border/60 flex items-center gap-3 border-b px-2 py-2.5 last:border-b-0"
        >
          <span className="bg-muted/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl opacity-70">
            <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{h.title}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {formatSchedule(h)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onRestore(h)}
            className="border-border hover:bg-muted flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
          <button
            type="button"
            aria-label={`Delete ${h.title} forever`}
            onClick={() => onDelete(h)}
            className="text-destructive hover:bg-destructive/15 flex h-9 w-9 items-center justify-center rounded-xl"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
