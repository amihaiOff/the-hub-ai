'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useUpdateTask, type TaskRow } from '@/lib/hooks/use-tasks';
import { DoneToggle } from './task-list-view';

/**
 * Collapsed "Archive" section at the bottom of the tasks page listing done
 * tasks. Each row shows a filled done toggle that, when tapped, marks the task
 * TODO again — moving it back out of the archive into the active views.
 */
export function TaskArchive({
  tasks,
  onOpenTask,
}: {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
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
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onOpenTask(task.id)}
              className="border-border/50 bg-card/50 hover:border-border flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors"
            >
              <DoneToggle
                done
                onToggle={() => update.mutate({ id: task.id, patch: { status: 'TODO' } })}
                label={`Restore “${task.title}”`}
              />
              <span className="text-muted-foreground flex-1 truncate text-sm line-through">
                {task.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
