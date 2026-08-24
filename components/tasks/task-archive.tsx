'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdateTask, type TaskRow } from '@/lib/hooks/use-tasks';
import { DoneToggle } from './task-list-view';

/**
 * Collapsed "Archive" section at the bottom of the tasks page listing done
 * tasks. Each row shows a filled done toggle that, when tapped, marks the task
 * TODO again — moving it back out of the archive into the active views.
 *
 * When `draggable` is enabled (calendar view), each row is a @dnd-kit
 * draggable whose id is `task:<taskId>`. The parent's DndContext catches
 * the drop on a calendar day cell and reassigns the task's due date.
 */
export function TaskArchive({
  tasks,
  onOpenTask,
  draggable = false,
}: {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  draggable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const update = useUpdateTask();

  return (
    <div className="border-border/60 rounded-2xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
        <span className="text-sm font-semibold">Archive</span>
        <span className="bg-muted/60 text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
          {tasks.length}
        </span>
        {draggable && open && (
          <span className="text-muted-foreground ml-auto text-[10px]">
            Drag to a day to reschedule
          </span>
        )}
      </button>

      {open && (
        // Cap the height and scroll internally when pinned (non-draggable) so a
        // large archive can't grow taller than the viewport and fight the
        // parent's `sticky bottom-0`. The calendar's draggable archive is left
        // uncapped — an overflow container would clip a row dragged out of it.
        <div className={cn('space-y-2 px-3 pb-3', !draggable && 'max-h-[50vh] overflow-y-auto')}>
          {tasks.map((task) =>
            draggable ? (
              <ArchiveDraggableRow
                key={task.id}
                task={task}
                onOpen={() => onOpenTask(task.id)}
                onRestore={() => update.mutate({ id: task.id, patch: { done: false } })}
              />
            ) : (
              <ArchiveStaticRow
                key={task.id}
                task={task}
                onOpen={() => onOpenTask(task.id)}
                onRestore={() => update.mutate({ id: task.id, patch: { done: false } })}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function ArchiveStaticRow({
  task,
  onOpen,
  onRestore,
}: {
  task: TaskRow;
  onOpen: () => void;
  onRestore: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="border-border/50 bg-card/50 hover:border-border flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors"
    >
      <DoneToggle done onToggle={onRestore} label={`Restore “${task.title}”`} />
      <span className="text-muted-foreground flex-1 truncate text-sm line-through">
        {task.title}
      </span>
    </div>
  );
}

/**
 * Same visual as ArchiveStaticRow but wired up as a @dnd-kit draggable so
 * the row can be dropped onto a calendar day. The done-toggle stops
 * propagation so tapping it (restore) doesn't start a drag.
 */
function ArchiveDraggableRow({
  task,
  onOpen,
  onRestore,
}: {
  task: TaskRow;
  onOpen: () => void;
  onRestore: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { taskId: task.id },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Distinguish click from drag: no drag → open; during drag → skip.
        if (isDragging) return;
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'border-border/50 bg-card/50 hover:border-border flex cursor-grab items-center gap-3 rounded-xl border px-3 py-2 transition-colors active:cursor-grabbing',
        isDragging && 'opacity-60 shadow-lg'
      )}
    >
      <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DoneToggle done onToggle={onRestore} label={`Restore “${task.title}”`} />
      </span>
      <span className="text-muted-foreground flex-1 truncate text-sm line-through">
        {task.title}
      </span>
    </div>
  );
}
