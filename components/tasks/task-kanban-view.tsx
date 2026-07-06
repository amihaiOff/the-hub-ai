'use client';

import { MessageSquare, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/lib/hooks/use-tasks';
import { TASK_STATUSES } from '@/lib/validations/tasks';
import { PriorityBadge, prettyStatus } from './task-list-view';
// Note: prettyStatus is re-exported here from the list view to keep imports tight.

interface TaskKanbanViewProps {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
}

const STATUS_DOT: Record<TaskRow['status'], string> = {
  TODO: 'bg-muted-foreground/60',
  IN_PROGRESS: 'bg-blue-500',
  BLOCKED: 'bg-amber-500',
  DONE: 'bg-emerald-500',
  CANCELLED: 'bg-muted-foreground/40',
};

/**
 * Static kanban view — columns by status, cards inside. DnD reordering
 * lives in a later phase; this is the read/click-to-open version so users
 * can navigate the board today.
 */
export function TaskKanbanView({ tasks, onOpenTask }: TaskKanbanViewProps) {
  const grouped = groupByStatus(tasks);
  return (
    <div className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-2">
      {TASK_STATUSES.map((status) => (
        <Column key={status} status={status} tasks={grouped[status]} onOpenTask={onOpenTask} />
      ))}
    </div>
  );
}

function Column({
  status,
  tasks,
  onOpenTask,
}: {
  status: TaskRow['status'];
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
}) {
  return (
    <div className="w-72 shrink-0 snap-start">
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
          <span className="text-sm font-semibold">{prettyStatus(status)}</span>
          <span className="bg-muted/60 text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          aria-label="Column options"
          className="text-muted-foreground hover:bg-muted/50 rounded-lg p-1"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
        ))}
        {tasks.length === 0 && (
          <div className="border-border/50 text-muted-foreground rounded-2xl border border-dashed px-3 py-6 text-center text-xs">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-border/60 bg-card hover:border-border block w-full rounded-2xl border p-4 text-left transition-colors"
    >
      {task.category && (
        <span className="text-muted-foreground bg-muted/60 mb-3 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
          {task.category.name}
        </span>
      )}
      <div className="text-sm leading-snug font-semibold">{task.title}</div>
      {task.notes && (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">{task.notes}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          {task.assignee && (
            <span className="bg-muted/70 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold">
              {initials(task.assignee.name)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />0
          </span>
        </div>
        <PriorityPill priority={task.priority} />
      </div>
    </button>
  );
}

function PriorityPill({ priority }: { priority: TaskRow['priority'] }) {
  // Pill style mirrors the mock — a filled rounded chip in bg tinted by
  // urgency. Uses the same PriorityBadge underneath so text/icon parity
  // with the list view is preserved.
  const bg = {
    URGENT: 'bg-red-500/15',
    HIGH: 'bg-red-500/15',
    MEDIUM: 'bg-muted',
    LOW: 'bg-muted',
  }[priority];
  return (
    <span className={cn('rounded-full px-2.5 py-1', bg)}>
      <PriorityBadge priority={priority} />
    </span>
  );
}

function groupByStatus(tasks: TaskRow[]): Record<TaskRow['status'], TaskRow[]> {
  const out: Record<TaskRow['status'], TaskRow[]> = {
    TODO: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    DONE: [],
    CANCELLED: [],
  };
  for (const t of tasks) out[t.status].push(t);
  return out;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
