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
import { Check, ChevronRight, ListTree, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCreateTask,
  useUpdateTask,
  type TaskCategoryRow,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { CategoryIcon } from './category-icon';
import { TASK_PRIORITIES, TASK_TYPES } from '@/lib/validations/tasks';
import { prettyStatus, PRIORITY_BORDER, TYPE_META, TypeOption, DoneToggle } from './task-list-view';
import { useToggleTaskDone } from './task-undo';
import { QuickAddPopover, type QuickAddOptions } from './quick-add-popover';
import { prettyPriority, prettyType } from './task-filters-bar';
import type { SelectionProps } from './task-selection';

export type GroupBy = 'status' | 'priority' | 'type' | 'category';

interface TaskKanbanViewProps extends SelectionProps {
  tasks: TaskRow[];
  categories: TaskCategoryRow[];
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
}

const NO_CATEGORY_ID = '__none__';
const NO_STATUS = '__nostatus__';
const NO_TYPE = '__notype__';

const PRIORITY_DOT: Record<TaskRow['priority'], string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-red-400',
  MEDIUM: 'bg-muted-foreground/60',
  LOW: 'bg-muted-foreground/40',
};

/**
 * Kanban view with drag-drop between columns. The column axis (status /
 * priority / type / category) is user-selectable; dropping a card into another
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

  const columns = useMemo(
    () => buildColumns(groupBy, categories, tasks),
    [groupBy, categories, tasks]
  );
  const grouped = useMemo(() => groupTasks(tasks, groupBy, columns), [tasks, groupBy, columns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const columnKey = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (groupBy === 'status') {
      const nextStatus = columnKey === NO_STATUS ? '' : columnKey;
      if (task.status !== nextStatus) {
        update.mutate({ id: task.id, patch: { status: nextStatus } });
      }
    } else if (groupBy === 'priority') {
      const nextPriority = columnKey as TaskRow['priority'];
      if (task.priority !== nextPriority) {
        update.mutate({ id: task.id, patch: { priority: nextPriority } });
      }
    } else if (groupBy === 'type') {
      // The "No type" column is the drop target for clearing the field.
      const nextType = columnKey === NO_TYPE ? null : (columnKey as TaskRow['type']);
      if (task.type !== nextType) {
        update.mutate({ id: task.id, patch: { type: nextType } });
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          {columns.map((col) => (
            <Column
              key={col.key}
              column={col}
              tasks={grouped[col.key] ?? []}
              categories={categories}
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

function buildColumns(groupBy: GroupBy, categories: TaskCategoryRow[], tasks: TaskRow[]): Column[] {
  if (groupBy === 'status') {
    // Status is free text — derive one column per distinct label present, then
    // always append a "No status" column (also the drop target for clearing).
    const labels = new Set<string>();
    for (const t of tasks) if (t.status) labels.add(t.status);
    const cols: Column[] = [...labels]
      .sort((a, b) => prettyStatus(a).localeCompare(prettyStatus(b)))
      .map((s) => ({ key: s, label: prettyStatus(s), dotClass: 'bg-muted-foreground/50' }));
    cols.push({ key: NO_STATUS, label: 'No status', dotClass: 'bg-muted-foreground/40' });
    return cols;
  }
  if (groupBy === 'priority') {
    return TASK_PRIORITIES.map((p) => ({
      key: p,
      label: prettyPriority(p),
      dotClass: PRIORITY_DOT[p],
    }));
  }
  if (groupBy === 'type') {
    // Fixed enum order, plus a "No type" column for untyped tasks.
    return [
      ...TASK_TYPES.map((t) => ({
        key: t,
        label: prettyType(t),
        dotClass: TYPE_META[t].dot,
      })),
      { key: NO_TYPE, label: 'No type', dotClass: 'bg-muted-foreground/40' },
    ];
  }
  // category — real categories first, "Uncategorized" pinned to the bottom.
  return [
    ...categories.map((c) => ({
      key: c.id,
      label: c.name,
      dotClass: 'bg-primary/60',
      icon: c.icon,
      color: c.color,
    })),
    {
      key: NO_CATEGORY_ID,
      label: 'Uncategorized',
      dotClass: 'bg-muted-foreground/40',
      icon: null,
      color: null,
    },
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
    if (groupBy === 'status') key = t.status || NO_STATUS;
    else if (groupBy === 'priority') key = t.priority;
    else if (groupBy === 'type') key = t.type ?? NO_TYPE;
    else key = t.categoryId ?? NO_CATEGORY_ID;
    if (out[key]) out[key].push(t);
  }
  return out;
}

// ─── Column (droppable) ─────────────────────────────────────────────────

function Column({
  column,
  tasks,
  categories,
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
  categories: TaskCategoryRow[];
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
  collapsed: boolean;
  onToggleCollapse: () => void;
} & SelectionProps) {
  // The whole column is the drop target (not just the area behind the cards),
  // and dropping stays enabled during selection mode. A collapsed group keeps
  // its header droppable so cards can still be dropped onto it.
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  // Quick-add from the column header (+). Pre-fills the field this board is
  // grouped by: category → the column's category, priority → the column's
  // priority, type → the column's type, status → stamped on the created task.
  const createTask = useCreateTask();
  const [addOpen, setAddOpen] = useState(false);
  const presetCategoryId =
    groupBy === 'category' ? (column.key === NO_CATEGORY_ID ? null : column.key) : null;
  const presetPriority = groupBy === 'priority' ? (column.key as TaskRow['priority']) : undefined;
  const presetType =
    groupBy === 'type' && column.key !== NO_TYPE ? (column.key as TaskRow['type']) : undefined;

  const handleAddSubmit = (title: string, opts: QuickAddOptions) => {
    createTask.mutate(
      {
        title,
        categoryId: opts.categoryId ?? undefined,
        priority: opts.priority,
        type: opts.type ?? undefined,
        dueDate: opts.dueDate ?? undefined,
        status: groupBy === 'status' && column.key !== NO_STATUS ? column.key : undefined,
      },
      { onSuccess: () => setAddOpen(false) }
    );
  };

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
        <QuickAddPopover
          open={addOpen}
          onOpenChange={setAddOpen}
          categories={categories}
          initialCategoryId={presetCategoryId}
          initialPriority={presetPriority}
          initialType={presetType}
          isSubmitting={createTask.isPending}
          onSubmit={handleAddSubmit}
          side="bottom"
          align="end"
        >
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label={`Add task in ${column.label}`}
            title={`Add task in ${column.label}`}
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded-lg p-1"
          >
            <Plus className="h-4 w-4" />
          </button>
        </QuickAddPopover>
      </div>
      {/* One column of cards per group; groups themselves sit in a 2-column
          grid at the parent level. min-height keeps an empty group a valid
          drop target. */}
      {!collapsed && (
        <div className="grid min-h-20 grid-cols-1 items-start gap-3">
          {tasks.map((task) => (
            <DraggableKanbanCard
              key={task.id}
              task={task}
              onOpenTask={onOpenTask}
              groupBy={groupBy}
              selectionMode={selectionMode}
              selected={selectedIds.has(task.id)}
              onEnterSelection={() => onEnterSelection(task.id)}
              onToggleSelection={() => onToggleSelection(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="border-border/50 text-muted-foreground rounded-2xl border border-dashed px-3 py-6 text-center text-xs">
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
  onOpenTask,
  groupBy,
  selectionMode,
  selected,
  onEnterSelection,
  onToggleSelection,
}: {
  task: TaskRow;
  onOpenTask: (id: string) => void;
  groupBy: GroupBy;
  selectionMode: boolean;
  selected: boolean;
  onEnterSelection: () => void;
  onToggleSelection: () => void;
}) {
  const onOpen = () => onOpenTask(task.id);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  // Hide checked-off sub-tasks from the card preview so completed work
  // doesn't linger visually. Users still see them in the detail sheet.
  const subtasks = (task.children ?? []).filter((c) => !c.done);
  const subtaskCount = subtasks.length;
  // Dragging stays enabled in selection mode: a tap toggles selection, a drag
  // moves the card.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const setDone = useToggleTaskDone();
  const isDone = task.done;
  const toggleDone = () => setDone(task, !isDone);
  // Tint only the left edge by urgency; the selected state keeps its primary ring.
  const style: React.CSSProperties = {
    ...(transform ? { transform: CSS.Translate.toString(transform) } : {}),
    ...(selected ? {} : { borderLeftColor: PRIORITY_BORDER[task.priority], borderLeftWidth: 4 }),
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
      <div className="flex items-start gap-2.5">
        {!selectionMode && (
          <DoneToggle
            done={isDone}
            onToggle={toggleDone}
            label={isDone ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0 flex-1">
          {task.category && groupBy !== 'category' && (
            <span className="text-muted-foreground bg-muted/60 mb-3 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
              {task.category.name}
            </span>
          )}
          {/* Title + status/type pills. On mobile they stack (pills
              underneath) so a long title doesn't collide with them; on desktop
              they inline to the right of the title, wrapping if needed. Each
              pill is suppressed when the board is already grouped by that
              field — the column header carries it. */}
          <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-2 lg:gap-y-1">
            <span className="text-sm leading-snug font-semibold break-words">{task.title}</span>
            {task.status && groupBy !== 'status' && (
              <span className="text-muted-foreground bg-muted/60 inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-medium">
                {prettyStatus(task.status)}
              </span>
            )}
            {task.type && groupBy !== 'type' && (
              <span
                className={cn(
                  'inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-medium',
                  TYPE_META[task.type].pill
                )}
              >
                <TypeOption type={task.type} />
              </span>
            )}
          </div>
          {/* Desktop-only notes preview — capped at 5 visible (wrapped)
              lines via line-clamp, not stored markdown lines, because a
              single long paragraph wraps into many visible ones. Mobile
              cards stay compact so a swipe gesture still targets the whole
              card cleanly. */}
          {task.notes && (
            // `hidden` at base + `lg:line-clamp-5` at lg. Do NOT add `lg:block`
            // alongside line-clamp — that overrides the `-webkit-box` display
            // Tailwind's line-clamp utility needs, and the preview would
            // render as a plain paragraph without truncation.
            <p className="text-muted-foreground mt-2 hidden text-xs leading-snug break-words lg:line-clamp-5">
              {notesPreview(task.notes)}
            </p>
          )}
          {task.assignee && (
            <div className="mt-3">
              <span className="bg-muted/70 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold">
                {initials(task.assignee.name)}
              </span>
            </div>
          )}
          {/* Sub-task collapsible — a chevron toggles a list of child titles
              with a priority dot each. Click a title to open that child's
              detail sheet directly. Stops propagation so tapping the chevron
              or a child doesn't also trigger the parent-card open gesture. */}
          {subtaskCount > 0 && (
            <div className="border-border/40 mt-3 border-t pt-2">
              <button
                type="button"
                aria-expanded={subtasksOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setSubtasksOpen((v) => !v);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] font-medium"
              >
                <ChevronRight
                  className={cn('h-3.5 w-3.5 transition-transform', subtasksOpen && 'rotate-90')}
                />
                <ListTree className="h-3.5 w-3.5" aria-hidden />
                <span>
                  {subtaskCount} sub-task{subtaskCount === 1 ? '' : 's'}
                </span>
              </button>
              {subtasksOpen && (
                <ul className="mt-1.5 space-y-1">
                  {subtasks.map((sub) => (
                    <li
                      key={sub.id}
                      className="hover:bg-muted/60 flex items-center gap-2 rounded-md pr-1 pl-1 text-xs"
                    >
                      {/* Left: click the label to drill into the sub-task. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTask(sub.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 py-1 text-left',
                          sub.done && 'text-muted-foreground line-through'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                            PRIORITY_DOT[sub.priority]
                          )}
                          aria-label={`Priority ${sub.priority.toLowerCase()}`}
                        />
                        <span className="truncate">{sub.title || 'Untitled'}</span>
                      </button>
                      {/* Right: compact done toggle. Inlined instead of
                          reusing DoneToggle so the icon size fits the row.
                          stopPropagation keeps the parent card from taking
                          this click as an open gesture. */}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={sub.done}
                        aria-label={
                          sub.done ? `Mark “${sub.title}” not done` : `Mark “${sub.title}” done`
                        }
                        title={sub.done ? 'Mark not done' : 'Mark done'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDone(sub, !sub.done);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                          sub.done
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-muted-foreground/40 hover:border-foreground text-transparent'
                        )}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
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

/**
 * Compress a markdown notes string into a plain-text preview for the card.
 * Strips common syntax (heading #, list bullets, blockquote >, emphasis
 * runs, inline code, link URLs) so the card doesn't leak raw markdown.
 * Collapses newlines to spaces — the caller uses CSS `line-clamp` to cap
 * the number of *visible* (wrapped) lines, which is what actually matches
 * user expectation on a variable-width card.
 */
function notesPreview(md: string): string {
  return md
    .split(/\r?\n/)
    .map((raw) =>
      raw
        .replace(/^\s*#{1,6}\s+/, '') // headings
        .replace(/^\s*>\s?/, '') // blockquotes
        .replace(/^\s*[-*+]\s+/, '• ') // bullets → bullet char
        .replace(/^\s*\d+\.\s+/, '') // numbered lists (drop marker)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
        .trim()
    )
    .filter((line) => line.length > 0)
    .join(' ');
}
