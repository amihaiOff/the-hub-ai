'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpdateTask, type TaskCategoryRow, type TaskRow } from '@/lib/hooks/use-tasks';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { CategoryIcon } from './category-icon';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/validations/tasks';
import { prettyStatus, PRIORITY_BORDER } from './task-list-view';
import { prettyPriority } from './task-filters-bar';
import type { SelectionProps } from './task-selection';

export type GroupBy = 'status' | 'priority' | 'category';

interface TaskKanbanViewProps extends SelectionProps {
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
export function TaskKanbanView({
  tasks,
  categories,
  onOpenTask,
  groupBy,
  selectionMode,
  selectedIds,
  onEnterSelection,
  onToggleSelection,
}: TaskKanbanViewProps) {
  const update = useUpdateTask();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Split by input type so vertical scrolls on mobile don't accidentally
  // pick a card up: mouse drags start after a small distance move
  // (immediate feel on desktop), touch drags require a hold before they
  // kick in so a scroll gesture has room to be interpreted as a scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );

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
        <div className="space-y-6">
          {columns.map((col) => (
            <Column
              key={col.key}
              column={col}
              tasks={grouped[col.key] ?? []}
              onOpenTask={onOpenTask}
              groupBy={groupBy}
              collapsed={collapsed.has(col.key)}
              onToggleCollapse={() => toggleCollapse(col.key)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onEnterSelection={onEnterSelection}
              onToggleSelection={onToggleSelection}
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
  /** Category icon/color — set only when grouping by category. */
  icon?: string | null;
  color?: string | null;
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
    {
      key: NO_CATEGORY_ID,
      label: 'Uncategorized',
      dotClass: 'bg-muted-foreground/40',
      icon: null,
      color: null,
    },
    ...categories.map((c) => ({
      key: c.id,
      label: c.name,
      dotClass: 'bg-primary/60',
      icon: c.icon,
      color: c.color,
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
  collapsed,
  onToggleCollapse,
  selectionMode,
  selectedIds,
  onEnterSelection,
  onToggleSelection,
}: {
  column: Column;
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
  collapsed: boolean;
  onToggleCollapse: () => void;
} & SelectionProps) {
  // The whole column is the drop target (not just the area behind the cards),
  // and dropping stays enabled during selection mode. A collapsed group keeps
  // its header droppable so cards can still be dropped onto it.
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-2xl p-1 transition-colors',
        isOver && 'bg-primary/5 outline-primary/40 outline-2 outline-dashed'
      )}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${column.label}` : `Collapse ${column.label}`}
          className="hover:text-foreground flex items-center gap-2"
        >
          <ChevronRight
            className={cn(
              'text-muted-foreground h-4 w-4 transition-transform',
              !collapsed && 'rotate-90'
            )}
          />
          {groupBy === 'category' ? (
            <CategoryIcon
              name={column.icon}
              color={column.color}
              className="text-muted-foreground h-4 w-4"
            />
          ) : (
            <span className={cn('h-2 w-2 rounded-full', column.dotClass)} />
          )}
          <span className="text-sm font-semibold">{column.label}</span>
          <span className="bg-muted/60 text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
            {tasks.length}
          </span>
        </button>
        <button
          type="button"
          aria-label="Column options"
          className="text-muted-foreground hover:bg-muted/50 rounded-lg p-1"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {/* Two columns of cards under each group, filling the screen width.
          min-height keeps an empty group a valid drop target. */}
      {!collapsed && (
        <div className="grid min-h-20 grid-cols-2 items-start gap-3">
          {tasks.map((task) => (
            <DraggableKanbanCard
              key={task.id}
              task={task}
              onOpen={() => onOpenTask(task.id)}
              groupBy={groupBy}
              selectionMode={selectionMode}
              selected={selectedIds.has(task.id)}
              onEnterSelection={() => onEnterSelection(task.id)}
              onToggleSelection={() => onToggleSelection(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="border-border/50 text-muted-foreground col-span-2 rounded-2xl border border-dashed px-3 py-6 text-center text-xs">
              No tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card (draggable) ───────────────────────────────────────────────────

function DraggableKanbanCard({
  task,
  onOpen,
  groupBy,
  selectionMode,
  selected,
  onEnterSelection,
  onToggleSelection,
}: {
  task: TaskRow;
  onOpen: () => void;
  groupBy: GroupBy;
  selectionMode: boolean;
  selected: boolean;
  onEnterSelection: () => void;
  onToggleSelection: () => void;
}) {
  // Dragging stays enabled in selection mode: a tap toggles selection, a drag
  // moves the card.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  // Colour the border by urgency; the selected state keeps its primary ring.
  const style: React.CSSProperties = {
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
    ...(selected ? {} : { borderColor: PRIORITY_BORDER[task.priority] }),
  };

  // Gesture split on a card: quick tap opens it, press-and-move drags it
  // (moveTolerance 5 < the dnd activation distance of 6, so moving cancels the
  // long press just before a drag begins), and a longer stationary hold
  // (500ms) enters multi-select.
  const { handlers: longPress, consumedClick } = useLongPress(onEnterSelection, {
    delay: 500,
    moveTolerance: 5,
  });

  const activate = () => {
    if (selectionMode) onToggleSelection();
    else onOpen();
  };

  // Always spread the drag handlers; compose the long-press detector only when
  // NOT already selecting (long press is what *enters* selection mode).
  const pointerProps = {
    ...attributes,
    ...listeners,
    ...(selectionMode
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent) => {
            listeners?.onPointerDown?.(e);
            longPress.onPointerDown(e);
          },
          onPointerMove: longPress.onPointerMove,
          onPointerUp: longPress.onPointerUp,
          onPointerCancel: longPress.onPointerCancel,
          onPointerLeave: longPress.onPointerLeave,
          onContextMenu: longPress.onContextMenu,
        }),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...pointerProps}
      {...(selectionMode ? { 'aria-pressed': selected } : {})}
      onClick={(e) => {
        // A real drag fires no click (activationConstraint distance:6), and a
        // long press consumes its trailing click, so a click here is genuine.
        if (isDragging) return;
        if (consumedClick()) return;
        e.stopPropagation();
        activate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      className={cn(
        // touch-none routes touch gestures to dnd (so vertical drag between
        // groups works); the stationary long-press still enters selection
        // because any movement cancels it before this could drag.
        'bg-card relative block w-full touch-none rounded-2xl border p-4 text-left transition-colors select-none',
        'cursor-grab',
        isDragging && 'opacity-60 shadow-lg',
        selected && 'border-primary ring-primary/40 ring-2'
      )}
    >
      {selectionMode && (
        <span
          className={cn(
            'absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background'
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      )}
      {task.category && groupBy !== 'category' && (
        <span className="text-muted-foreground bg-muted/60 mb-3 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
          {task.category.name}
        </span>
      )}
      <div className="text-sm leading-snug font-semibold break-words">{task.title}</div>
      {task.notes && (
        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">{task.notes}</p>
      )}
      {task.assignee && (
        <div className="mt-3">
          <span className="bg-muted/70 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold">
            {initials(task.assignee.name)}
          </span>
        </div>
      )}
    </div>
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
