'use client';

import { Bell, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { CategoryIcon } from '@/components/tasks/category-icon';
import { useReorderHabits, type HabitRow } from '@/lib/hooks/use-habits';
import { formatTime, WEEKDAY_LABELS } from '@/lib/habits/schedule';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3';

/** "Every 2 weeks at 08:00" / "Sun, Mon, Tue" — the card's two schedule lines. */
function scheduleLines(h: HabitRow) {
  const everyDay = h.intervalWeeks === 1 && new Set(h.weekdays).size === 7;
  const every = everyDay
    ? 'Every day'
    : h.intervalWeeks === 1
      ? 'Every week'
      : `Every ${h.intervalWeeks} weeks`;
  return {
    head: everyDay ? every : `${every} at ${formatTime(h.timeMinutes)}`,
    tail: everyDay
      ? formatTime(h.timeMinutes)
      : [...h.weekdays]
          .sort()
          .map((d) => WEEKDAY_LABELS[d])
          .join(', '),
  };
}

function CardBody({ habit: h, muted }: { habit: HabitRow; muted?: boolean }) {
  const { head, tail } = scheduleLines(h);
  return (
    <>
      <span className="mb-1 block truncate text-sm font-semibold">{h.title}</span>
      <span
        className={cn(
          'text-muted-foreground mt-auto text-[10px] leading-tight',
          muted && 'opacity-80'
        )}
      >
        <span className="text-foreground/70 mb-0.5 flex items-center gap-1 font-medium">
          {head}
          {h.notify && <Bell className="h-2.5 w-2.5" aria-label="Notifications on" />}
        </span>
        {tail}
      </span>
    </>
  );
}

/** Active habits as a card grid. Drag to reorder (mouse drag, long-press on touch). */
export function HabitDirectory({
  habits,
  onOpen,
}: {
  habits: HabitRow[];
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={habits.map((h) => h.id)} strategy={rectSortingStrategy}>
        <ul className={GRID} aria-label="Habits">
          {habits.map((h) => (
            <SortableCard key={h.id} habit={h} onOpen={() => onOpen(h)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({ habit: h, onOpen }: { habit: HabitRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: h.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative h-full', isDragging && 'z-10')}
    >
      {/* The drag surface is a sibling of the ⋯ button, not its parent, so
          no control is nested inside another. */}
      <div
        {...attributes}
        {...listeners}
        aria-roledescription="Draggable habit"
        aria-label={h.title}
        onClick={onOpen}
        className={cn(
          'border-border bg-card hover:border-foreground/20 flex h-full cursor-pointer touch-manipulation flex-col rounded-2xl border p-4 transition-colors select-none',
          isDragging && 'shadow-glow-lg'
        )}
      >
        <span className="bg-muted mb-3 flex h-8 w-8 items-center justify-center rounded-lg">
          <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4" />
        </span>
        <CardBody habit={h} />
      </div>
      {/* A real button so the habit opens from the keyboard too (Enter on
          the card is taken by the drag sensor). */}
      <button
        type="button"
        aria-label={`Edit ${h.title}`}
        onClick={onOpen}
        className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-lg"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Archived habits: newest archive first; restore or delete for good. */
export function ArchivedHabitDirectory({
  habits,
  onRestore,
  onDelete,
}: {
  habits: HabitRow[];
  onRestore: (habit: HabitRow) => void;
  onDelete: (habit: HabitRow) => void;
}) {
  return (
    <ul className={GRID} aria-label="Archived habits">
      {habits.map((h) => (
        <li
          key={h.id}
          className="border-border bg-card flex h-full flex-col rounded-2xl border p-4"
        >
          <div className="mb-3 flex items-start justify-between">
            <span className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg opacity-70">
              <CategoryIcon name={h.icon} color={h.color} className="h-4 w-4" />
            </span>
            <button
              type="button"
              aria-label={`Delete ${h.title} forever`}
              onClick={() => onDelete(h)}
              className="text-destructive hover:bg-destructive/15 -m-3 flex h-11 w-11 items-center justify-center rounded-lg"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <CardBody habit={h} muted />
          <button
            type="button"
            onClick={() => onRestore(h)}
            className="border-border hover:bg-muted mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
