'use client';

import {
  AlertCircle,
  Ban,
  Brain,
  Check,
  ChevronDown,
  Footprints,
  Minus,
  Phone,
  Scale,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type TaskRow } from '@/lib/hooks/use-tasks';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { useToggleTaskDone } from './task-undo';
import { prettyStatus, prettyPriority, prettyType } from './task-filters-bar';
import { Checkbox } from '@/components/ui/checkbox';
import { SubtaskBadge } from './subtask-badge';
import type { SelectionProps } from './task-selection';

interface TaskListViewProps extends SelectionProps {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
}

/**
 * Left-border accent colour by urgency (priority). Applied as an inline
 * `borderLeftColor` + width so only the left edge is tinted (like the AI-guess
 * accent on transaction rows); the rest of the border stays neutral. The
 * selected state keeps its own primary ring instead. Shared with the kanban cards.
 */
export const PRIORITY_BORDER: Record<TaskRow['priority'], string> = {
  URGENT: '#ef4444',
  HIGH: '#f87171',
  MEDIUM: '#eab308',
  LOW: '#94a3b8',
};

/**
 * Per-type icon + accent, shared by every surface that renders a task's
 * work-mode (list badge, board dot, quick-add chip, detail pill). Colours
 * are picked to stay distinguishable from the priority palette — priority
 * answers "how urgent", type answers "what kind of work".
 */
export const TYPE_META: Record<
  NonNullable<TaskRow['type']>,
  { icon: LucideIcon; text: string; dot: string; pill: string }
> = {
  CALLS: {
    icon: Phone,
    text: 'text-sky-400',
    dot: 'bg-sky-400',
    pill: 'bg-sky-500/15 text-sky-300',
  },
  DEEP_WORK: {
    icon: Brain,
    text: 'text-violet-400',
    dot: 'bg-violet-400',
    pill: 'bg-violet-500/15 text-violet-300',
  },
  OUT_AND_ABOUT: {
    icon: Footprints,
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    pill: 'bg-amber-500/15 text-amber-300',
  },
  BLOCKED: {
    icon: Ban,
    text: 'text-red-400',
    dot: 'bg-red-400',
    pill: 'bg-red-500/15 text-red-300',
  },
  DECIDE: {
    icon: Scale,
    text: 'text-fuchsia-400',
    dot: 'bg-fuchsia-400',
    pill: 'bg-fuchsia-500/15 text-fuchsia-300',
  },
  QUICK: {
    icon: Zap,
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    pill: 'bg-emerald-500/15 text-emerald-300',
  },
};

/**
 * Circular done toggle shown on each task card. Filled green with a check when
 * done. Stops click/pointer propagation so it never opens the card or starts a
 * drag (it lives inside draggable/clickable cards).
 */
export function DoneToggle({
  done,
  onToggle,
  label,
  className,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      // No React `onPointerDown` here: any synthetic pointer handler in the
      // mounted tree causes react-dom to attach non-passive
      // pointerdown/pointermove delegates on `document`, which iOS Safari
      // then waits on before starting the first scroll. onClick alone is
      // enough — the card's long-press hook uses native passive listeners.
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-muted-foreground/40 hover:border-foreground hover:text-muted-foreground text-transparent',
        className
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Card-per-row list. Each card is a fixed grid of label/value rows —
 * Category, Type, Status, Priority, Due — with a checkbox at the top-left that
 * toggles DONE/TODO and strikes through the title. Long-pressing a card
 * enters selection mode; in selection mode a tap toggles selection.
 */
export function TaskListView({
  tasks,
  onOpenTask,
  selectionMode,
  selectedIds,
  onEnterSelection,
  onToggleSelection,
}: TaskListViewProps) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onOpen={() => onOpenTask(task.id)}
          selectionMode={selectionMode}
          selected={selectedIds.has(task.id)}
          onEnterSelection={() => onEnterSelection(task.id)}
          onToggleSelection={() => onToggleSelection(task.id)}
        />
      ))}
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  selectionMode,
  selected,
  onEnterSelection,
  onToggleSelection,
}: {
  task: TaskRow;
  onOpen: () => void;
  selectionMode: boolean;
  selected: boolean;
  onEnterSelection: () => void;
  onToggleSelection: () => void;
}) {
  const setDone = useToggleTaskDone();
  const isDone = task.done;
  // Preview count reflects OPEN sub-tasks only — checked-off items drop
  // out of the card the moment they're marked done.
  const openChildren = (task.children ?? []).filter((c) => !c.done);
  const hasChildren = openChildren.length > 0;

  const { bindRef, consumedClick } = useLongPress(onEnterSelection);

  const toggleDone = (checked: boolean) => setDone(task, checked);

  const activate = () => {
    if (consumedClick()) return;
    if (selectionMode) onToggleSelection();
    else onOpen();
  };

  // The card is a plain clickable div (not role="button") so the interactive
  // controls it contains — the checkbox and the title button — remain valid;
  // keyboard users act through those focusable children.
  return (
    <div
      ref={bindRef}
      onClick={activate}
      style={
        selected
          ? undefined
          : { borderLeftColor: PRIORITY_BORDER[task.priority], borderLeftWidth: 4 }
      }
      className={cn(
        // touch-manipulation (not pan-y) so iOS Safari doesn't hold the
        // first touch waiting to see if it becomes a double-tap zoom —
        // that's the "first tap doesn't scroll" symptom on this list.
        'bg-card cursor-pointer touch-manipulation rounded-3xl border px-5 py-4 transition-colors select-none',
        selected && 'border-primary ring-primary/40 ring-2'
      )}
    >
      {/* Header: checkbox + title. The leading checkbox toggles DONE normally,
          and reflects selection while in selection mode. */}
      <div className="flex items-start gap-3">
        {/* Same reasoning as DoneToggle above — no React onPointerDown here. */}
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectionMode ? selected : isDone}
            onCheckedChange={(v) => (selectionMode ? onToggleSelection() : toggleDone(v === true))}
            className="mt-1 h-5 w-5 rounded-md"
            aria-label={
              selectionMode
                ? selected
                  ? 'Deselect task'
                  : 'Select task'
                : isDone
                  ? 'Mark task as not done'
                  : 'Mark task as done'
            }
          />
        </span>
        <button
          type="button"
          aria-pressed={selectionMode ? selected : undefined}
          onClick={(e) => {
            e.stopPropagation();
            activate();
          }}
          className={cn(
            'flex-1 text-left text-base leading-tight font-semibold',
            isDone && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </button>
        {hasChildren && <SubtaskBadge count={openChildren.length} />}
      </div>

      {/* Field rows */}
      <div className="mt-3 space-y-2 pl-8">
        <Row label="Category" value={<CategoryValue task={task} />} />
        <Row label="Type" value={<TypeBadge type={task.type} />} />
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
  // Status is now a free-text label; an empty label shows a neutral dash.
  const label = prettyStatus(status);
  if (!label) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'bg-muted text-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
      )}
    >
      {label}
    </span>
  );
}

export function TypeBadge({ type }: { type: TaskRow['type'] }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', meta.text)}>
      <Icon className="h-3.5 w-3.5" />
      {prettyType(type)}
    </span>
  );
}

/**
 * Icon + label for a work type — the shared vocabulary every type picker
 * renders, so the bare icon on a task card stays readable once you've seen it
 * next to its name in the dropdowns.
 */
export function TypeOption({
  type,
  className,
}: {
  type: NonNullable<TaskRow['type']>;
  className?: string;
}) {
  const Icon = TYPE_META[type].icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {prettyType(type)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskRow['priority'] }) {
  const meta = {
    URGENT: { cls: 'text-red-500', icon: TriangleAlert },
    HIGH: { cls: 'text-red-400', icon: AlertCircle },
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
