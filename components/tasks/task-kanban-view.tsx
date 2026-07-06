'use client';

import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdateTask, type TaskCategoryRow, type TaskRow } from '@/lib/hooks/use-tasks';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/validations/tasks';
import { PriorityBadge, prettyStatus } from './task-list-view';
import { prettyPriority } from './task-filters-bar';

export type GroupBy = 'status' | 'priority' | 'category';

interface TaskKanbanViewProps {
  tasks: TaskRow[];
  categories: TaskCategoryRow[];
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
}

const NO_CATEGORY_ID = '__none__';

const STATUS_DOT: Record<TaskRow['status'], string> = {
  TODO: 'bg-muted-foreground/60',
  IN_PROGRESS: 'bg-blue-500',
  BLOCKED: 'bg-amber-500',
  DONE: 'bg-emerald-500',
  CANCELLED: 'bg-muted-foreground/40',
};

const PRIORITY_DOT: Record<TaskRow['priority'], string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-muted-foreground/60',
  LOW: 'bg-muted-foreground/40',
};

/**
 * Kanban view with drag-drop between columns. The column axis (status /
 * priority / category) is user-selectable; dropping a card into another
 * column PATCHes the corresponding field via useUpdateTask's optimistic
 * update, so the card lands in its new column immediately.
 */
export function TaskKanbanView({ tasks, categories, onOpenTask, groupBy }: TaskKanbanViewProps) {
  const update = useUpdateTask();

  // Small pointer activation distance so a click still opens the detail
  // sheet — the drag only kicks in after a real drag gesture.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = useMemo(() => buildColumns(groupBy, categories), [groupBy, categories]);
  const grouped = useMemo(() => groupTasks(tasks, groupBy, columns), [tasks, groupBy, columns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const columnKey = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (groupBy === 'status') {
      const nextStatus = columnKey as TaskRow['status'];
      if (task.status !== nextStatus) {
        update.mutate({ id: task.id, patch: { status: nextStatus } });
      }
    } else if (groupBy === 'priority') {
      const nextPriority = columnKey as TaskRow['priority'];
      if (task.priority !== nextPriority) {
        update.mutate({ id: task.id, patch: { priority: nextPriority } });
      }
    } else {
      const nextCategoryId = columnKey === NO_CATEGORY_ID ? null : columnKey;
      if (task.categoryId !== nextCategoryId) {
        update.mutate({ id: task.id, patch: { categoryId: nextCategoryId } });
      }
    }
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-2">
          {columns.map((col) => (
            <Column
              key={col.key}
              column={col}
              tasks={grouped[col.key] ?? []}
              onOpenTask={onOpenTask}
              groupBy={groupBy}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

// ─── Grouping helpers ───────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  dotClass: string;
}

function buildColumns(groupBy: GroupBy, categories: TaskCategoryRow[]): Column[] {
  if (groupBy === 'status') {
    return TASK_STATUSES.map((s) => ({
      key: s,
      label: prettyStatus(s),
      dotClass: STATUS_DOT[s],
    }));
  }
  if (groupBy === 'priority') {
    return TASK_PRIORITIES.map((p) => ({
      key: p,
      label: prettyPriority(p),
      dotClass: PRIORITY_DOT[p],
    }));
  }
  // category
  return [
    { key: NO_CATEGORY_ID, label: 'Uncategorized', dotClass: 'bg-muted-foreground/40' },
    ...categories.map((c) => ({
      key: c.id,
      label: c.name,
      dotClass: 'bg-primary/60',
    })),
  ];
}

function groupTasks(
  tasks: TaskRow[],
  groupBy: GroupBy,
  columns: Column[]
): Record<string, TaskRow[]> {
  const out: Record<string, TaskRow[]> = {};
  for (const c of columns) out[c.key] = [];
  for (const t of tasks) {
    let key: string;
    if (groupBy === 'status') key = t.status;
    else if (groupBy === 'priority') key = t.priority;
    else key = t.categoryId ?? NO_CATEGORY_ID;
    if (out[key]) out[key].push(t);
  }
  return out;
}

// ─── Column (droppable) ─────────────────────────────────────────────────

function Column({
  column,
  tasks,
  onOpenTask,
  groupBy,
}: {
  column: Column;
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className="w-72 shrink-0 snap-start">
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', column.dotClass)} />
          <span className="text-sm font-semibold">{column.label}</span>
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
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-24 space-y-3 rounded-2xl p-1 transition-colors',
          isOver && 'bg-primary/5 outline-primary/40 outline-2 outline-dashed'
        )}
      >
        {tasks.map((task) => (
          <DraggableKanbanCard
            key={task.id}
            task={task}
            onOpen={() => onOpenTask(task.id)}
            groupBy={groupBy}
          />
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

// ─── Card (draggable) ───────────────────────────────────────────────────

function DraggableKanbanCard({
  task,
  onOpen,
  groupBy,
}: {
  task: TaskRow;
  onOpen: () => void;
  groupBy: GroupBy;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Distinguish click from drag: dnd-kit fires no click after a real
        // drag gesture (activationConstraint distance:6), so a click here
        // is genuinely a click and should open the detail sheet.
        if (isDragging) return;
        // Prevent the outer draggable's default from swallowing the click.
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'border-border/60 bg-card hover:border-border block w-full cursor-grab rounded-2xl border p-4 text-left transition-colors',
        isDragging && 'opacity-60 shadow-lg'
      )}
    >
      {task.category && groupBy !== 'category' && (
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
        {groupBy !== 'priority' && <PriorityPill priority={task.priority} />}
      </div>
    </div>
  );
}

function PriorityPill({ priority }: { priority: TaskRow['priority'] }) {
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
