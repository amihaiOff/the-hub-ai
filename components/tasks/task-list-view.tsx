'use client';

import { AlertCircle, ChevronDown, Minus, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdateTask, type TaskRow } from '@/lib/hooks/use-tasks';
import { prettyStatus, prettyPriority } from './task-filters-bar';
import { Checkbox } from '@/components/ui/checkbox';

interface TaskListViewProps {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
}

/**
 * Card-per-row list. Each card is a fixed grid of label/value rows —
 * Category, Status, Priority, Due — with a checkbox at the top-left that
 * toggles DONE/TODO and strikes through the title.
 */
export function TaskListView({ tasks, onOpenTask }: TaskListViewProps) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
      ))}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const update = useUpdateTask();
  const isDone = task.status === 'DONE';
  const hasChildren = (task.children?.length ?? 0) > 0;

  const toggleDone = (checked: boolean) => {
    update.mutate({ id: task.id, patch: { status: checked ? 'DONE' : 'TODO' } });
  };

  return (
    <div
      className={cn(
        'border-border/60 bg-card rounded-3xl border px-5 py-4 transition-colors',
        'hover:border-border'
      )}
    >
      {/* Header: checkbox + title */}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isDone}
          onCheckedChange={(v) => toggleDone(v === true)}
          className="mt-1 h-5 w-5 rounded-md"
          aria-label={isDone ? 'Mark task as not done' : 'Mark task as done'}
        />
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'flex-1 text-left text-base leading-tight font-semibold',
            isDone && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </button>
        {hasChildren && (
          <span className="text-muted-foreground text-xs">{task.children!.length} sub</span>
        )}
      </div>

      {/* Field rows */}
      <div className="mt-3 space-y-2 pl-8">
        <Row label="Category" value={<CategoryValue task={task} />} />
        <Row label="Status" value={<StatusBadge status={task.status} />} />
        <Row label="Priority" value={<PriorityBadge priority={task.priority} />} />
        <Row label="Due" value={<DueValue iso={task.dueDate} />} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function CategoryValue({ task }: { task: TaskRow }) {
  if (!task.category) return <span className="text-muted-foreground">—</span>;
  return <span className="font-medium">{task.category.name}</span>;
}

export function StatusBadge({ status }: { status: TaskRow['status'] }) {
  const cls = {
    TODO: 'bg-muted text-foreground',
    IN_PROGRESS: 'bg-blue-500/15 text-blue-500',
    BLOCKED: 'bg-amber-500/15 text-amber-500',
    DONE: 'bg-emerald-500/15 text-emerald-500',
    CANCELLED: 'bg-muted text-muted-foreground line-through',
  }[status];
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cls)}
    >
      {prettyStatus(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskRow['priority'] }) {
  const meta = {
    URGENT: { cls: 'text-red-500', icon: TriangleAlert },
    HIGH: { cls: 'text-red-500', icon: AlertCircle },
    MEDIUM: { cls: 'text-muted-foreground', icon: Minus },
    LOW: { cls: 'text-muted-foreground', icon: ChevronDown },
  }[priority];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', meta.cls)}>
      <Icon className="h-3.5 w-3.5" />
      {prettyPriority(priority).toUpperCase()}
    </span>
  );
}

export function DueValue({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const date = new Date(iso);
  return (
    <span className="font-medium">
      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  );
}

// Re-export prettyStatus for the kanban view without a circular-ish
// import through task-filters-bar (list-view is a leaf everyone imports).
export { prettyStatus } from './task-filters-bar';
