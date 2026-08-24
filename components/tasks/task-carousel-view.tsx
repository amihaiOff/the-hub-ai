'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateTask, type TaskCategoryRow, type TaskRow } from '@/lib/hooks/use-tasks';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { TASK_TYPES, TASK_PRIORITIES } from '@/lib/validations/tasks';
import { useToggleTaskDone } from './task-undo';
import { DoneToggle, PRIORITY_BORDER, TYPE_META } from './task-list-view';
import { prettyPriority, prettyStatus, prettyType } from './task-filters-bar';
import { QuickAddPopover, type QuickAddOptions } from './quick-add-popover';

export const NO_CATEGORY_ID = '__none__';
export const NO_TYPE = '__notype__';

/** The axis the carousel's columns run along. */
export type CarouselGroupBy = 'category' | 'type' | 'priority';

interface TaskCarouselViewProps {
  tasks: TaskRow[];
  categories: TaskCategoryRow[];
  /** Opens the task full-screen (long press on a row). */
  onOpenTask: (id: string) => void;
  groupBy: CarouselGroupBy;
}

interface CarouselColumn {
  key: string;
  label: string;
  /** Category colour, applied inline to the header dot. */
  color: string | null;
  /** Work-mode icon, shown instead of the dot when grouping by type. */
  icon?: LucideIcon;
  iconClass?: string;
  tasks: TaskRow[];
}

/**
 * Mobile-first category carousel.
 *
 * One horizontally snapping column per group — category (default) or work
 * type — sized so the neighbouring columns peek in from both edges. A chip row
 * above mirrors the carousel: tapping a chip snaps to that column, swiping the
 * carousel highlights the matching chip. The parent keys this component on
 * the axis, so switching it remounts back to the first column instead of
 * landing on whatever happens to sit at the old index.
 *
 * Rows are deliberately compact (done toggle · priority bar · title · relative
 * due) so a whole category reads at a glance. Tapping a row expands it in
 * place to reveal status and due date on their own lines; long-pressing opens
 * the task full-screen. Each column header carries a **+** that quick-adds
 * into that group, pre-filling whichever field the track is grouped by. Unlike the list/kanban views there is no multi-select
 * here — the long press is spent on the full-screen open.
 */
export function TaskCarouselView({
  tasks,
  categories,
  onOpenTask,
  groupBy,
}: TaskCarouselViewProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Set while we scroll the track ourselves (chip tap) so the scroll handler
  // doesn't fight the animation and snap the active index back.
  const programmaticUntil = useRef(0);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The track is a flex row, so without this it would always stand as tall as
  // the *longest* category — leaving a screenful of dead space under a short
  // one. Follow the active column's height instead (re-measured when a row
  // expands, via the ResizeObserver below).
  const [trackHeight, setTrackHeight] = useState<number | undefined>(undefined);

  const columns = useMemo(
    () => buildColumns(groupBy, categories, tasks),
    [groupBy, categories, tasks]
  );

  // Categories can disappear (deleted, or the last uncategorized task just got
  // one) while a later column is active — clamp during render so the chips and
  // the track never point past the end.
  const activeIndex = Math.min(selectedIndex, Math.max(columns.length - 1, 0));

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    const column = columnRefs.current[index];
    if (!track || !column) return;
    programmaticUntil.current = Date.now() + 600;
    setSelectedIndex(index);
    track.scrollTo({ left: column.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }, []);

  // Swipe → active chip. Picks the column whose centre is nearest the track's
  // centre, which stays correct mid-swipe and for the shorter last column.
  const handleScroll = useCallback(() => {
    if (Date.now() < programmaticUntil.current) return;
    const track = trackRef.current;
    if (!track) return;
    const centre = track.scrollLeft + track.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    columnRefs.current.forEach((col, i) => {
      if (!col) return;
      const dist = Math.abs(col.offsetLeft - track.offsetLeft + col.clientWidth / 2 - centre);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setSelectedIndex((prev) => (prev === nearest ? prev : nearest));
  }, []);

  useEffect(() => {
    const column = columnRefs.current[activeIndex];
    if (!column || typeof ResizeObserver === 'undefined') return;
    // On md+ several columns are visible at once, so pinning the track to the
    // active column's height would crop the others. Let the flex row grow to
    // its tallest child instead; we only track a single column's height on
    // narrow screens where exactly one is dominant.
    const isNarrow = () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        // Tests (jsdom) don't ship matchMedia; assume mobile so the existing
        // height-tracking assertions keep passing.
        return true;
      }
      return window.matchMedia('(max-width: 767px)').matches;
    };
    const measure = () => setTrackHeight(isNarrow() ? column.offsetHeight : undefined);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [activeIndex, columns, expandedId]);

  // Keep the active chip in view when the carousel is driven by a swipe.
  useEffect(() => {
    const chip = chipRefs.current[activeIndex];
    const chips = chipsRef.current;
    if (!chip || !chips) return;
    const target = chip.offsetLeft - (chips.clientWidth - chip.clientWidth) / 2;
    chips.scrollTo({ left: Math.max(target, 0), behavior: 'smooth' });
  }, [activeIndex]);

  if (columns.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* ── Category chips ─────────────────────────────────────────────── */}
      <div
        ref={chipsRef}
        role="tablist"
        aria-label="Task categories"
        // -mx-4 px-4 lets the row bleed to the screen edges inside the
        // padded page shell, so a chip can scroll fully off-screen.
        className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {columns.map((col, i) => (
          <button
            key={col.key}
            ref={(el) => {
              chipRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            onClick={() => scrollToIndex(i)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              i === activeIndex
                ? 'bg-foreground text-background'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            {col.label}
          </button>
        ))}
      </div>

      {/* ── Carousel track ─────────────────────────────────────────────── */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        style={{ height: trackHeight }}
        // overflow-y-hidden so a taller neighbour is cropped to the active
        // column's height (a clean edge) instead of adding a nested scrollbar.
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory scroll-pl-4 items-start gap-3 overflow-x-auto overflow-y-hidden px-4 transition-[height] duration-200"
      >
        {columns.map((col, i) => (
          <div
            key={col.key}
            ref={(el) => {
              columnRefs.current[i] = el;
            }}
            // Mobile: narrower than the viewport so the next column peeks in
            // on both edges. md+: fixed 320px so as many columns as the
            // viewport can hold sit side by side — on a wide screen the whole
            // set fits, on a small laptop only part, and the rest scroll.
            className="w-[calc(100%-3.5rem)] shrink-0 snap-start md:w-80"
          >
            <div className="flex items-center gap-2.5 px-1 pb-2">
              {col.icon ? (
                <col.icon className={cn('h-4 w-4 shrink-0', col.iconClass)} />
              ) : (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: col.color ?? 'var(--muted-foreground)' }}
                />
              )}
              <span className="flex-1 truncate text-lg font-bold">{col.label}</span>
              <span className="text-muted-foreground text-sm tabular-nums">{col.tasks.length}</span>
              <ColumnAddButton column={col} groupBy={groupBy} categories={categories} />
            </div>
            <div className="space-y-0.5">
              {col.tasks.map((task) => (
                <CarouselTaskRow
                  key={task.id}
                  task={task}
                  // Grouping by type already puts the icon in the header —
                  // repeating it on every row would be noise.
                  showTypeIcon={groupBy !== 'type'}
                  expanded={expandedId === task.id}
                  onToggleExpand={() =>
                    setExpandedId((current) => (current === task.id ? null : task.id))
                  }
                  onOpenFullScreen={() => onOpenTask(task.id)}
                />
              ))}
              {col.tasks.length === 0 && (
                <p className="border-border/50 text-muted-foreground rounded-2xl border border-dashed px-3 py-6 text-center text-xs">
                  No tasks
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Column quick-add ───────────────────────────────────────────────────

/**
 * The **+** in a column header. Mirrors the kanban column's quick-add: it
 * opens the same popover with whichever field the track is grouped by already
 * filled in, so a task added under "Finance" lands in Finance.
 */
function ColumnAddButton({
  column,
  groupBy,
  categories,
}: {
  column: CarouselColumn;
  groupBy: CarouselGroupBy;
  categories: TaskCategoryRow[];
}) {
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);

  // The catch-all columns ("Uncategorized" / "No type") pre-fill nothing —
  // they're exactly the absence of that field.
  const presetCategoryId =
    groupBy === 'category' && column.key !== NO_CATEGORY_ID ? column.key : null;
  const presetType =
    groupBy === 'type' && column.key !== NO_TYPE ? (column.key as TaskRow['type']) : undefined;

  const handleSubmit = (title: string, opts: QuickAddOptions) => {
    createTask.mutate(
      {
        title,
        categoryId: opts.categoryId ?? undefined,
        priority: opts.priority,
        type: opts.type ?? undefined,
        dueDate: opts.dueDate ?? undefined,
      },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <QuickAddPopover
      open={open}
      onOpenChange={setOpen}
      categories={categories}
      initialCategoryId={presetCategoryId}
      initialType={presetType}
      isSubmitting={createTask.isPending}
      onSubmit={handleSubmit}
      side="bottom"
      align="end"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Add task in ${column.label}`}
        title={`Add task in ${column.label}`}
        className="text-muted-foreground hover:bg-muted/50 hover:text-foreground shrink-0 rounded-lg p-1"
      >
        <Plus className="h-4 w-4" />
      </button>
    </QuickAddPopover>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function CarouselTaskRow({
  task,
  showTypeIcon,
  expanded,
  onToggleExpand,
  onOpenFullScreen,
}: {
  task: TaskRow;
  showTypeIcon: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenFullScreen: () => void;
}) {
  const setDone = useToggleTaskDone();
  // bindRef (native passive listeners) rather than the synthetic handlers —
  // these rows live in a scroller and React's non-passive delegates stall the
  // first touch scroll on iOS. moveTolerance is small so a horizontal swipe of
  // the carousel cancels the press instead of opening a task.
  const { bindRef, consumedClick } = useLongPress(onOpenFullScreen, {
    delay: 450,
    moveTolerance: 8,
  });

  const due = relativeDueLabel(task.dueDate);
  const status = prettyStatus(task.status);
  const typeMeta = task.type ? TYPE_META[task.type] : null;
  const TypeIcon = typeMeta?.icon;

  return (
    <div
      ref={bindRef}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => {
        // The long press already fired and consumed this click.
        if (consumedClick()) return;
        onToggleExpand();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-2xl px-2 py-2.5 text-left transition-colors select-none',
        expanded && 'bg-secondary/70'
      )}
    >
      <div className="flex items-center gap-2.5">
        <DoneToggle
          done={task.done}
          onToggle={() => setDone(task, !task.done)}
          label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        />
        <span
          className="h-5 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: PRIORITY_BORDER[task.priority] }}
          aria-label={`Priority ${prettyPriority(task.priority)}`}
        />
        {/* dir="auto" so Hebrew titles right-align and Latin ones left-align
            inside the same LTR row — the due label stays on the right.
            Titles wrap (no truncate); break-words keeps a long unbroken
            string from overflowing the card. */}
        <span dir="auto" className="min-w-0 flex-1 text-base break-words">
          {task.title || 'Untitled'}
        </span>
        {/* Across from the title: the work-mode icon, then the due label. */}
        {showTypeIcon && TypeIcon && task.type && (
          <TypeIcon
            className={cn('h-4 w-4 shrink-0', typeMeta?.text)}
            aria-label={prettyType(task.type)}
          />
        )}
        {due && (
          <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">{due}</span>
        )}
      </div>

      {/* Expanded: status and due date each get their own line. */}
      {expanded && (
        <div className="text-muted-foreground mt-1.5 space-y-0.5 pl-11 text-xs">
          <p>{status ? `Status: ${status}` : 'No status'}</p>
          <p>{task.dueDate ? `Due ${formatDueDate(task.dueDate)}` : 'No due date'}</p>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function buildColumns(
  groupBy: CarouselGroupBy,
  categories: TaskCategoryRow[],
  tasks: TaskRow[]
): CarouselColumn[] {
  const buckets = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const key =
      groupBy === 'type'
        ? (t.type ?? NO_TYPE)
        : groupBy === 'priority'
          ? t.priority
          : (t.categoryId ?? NO_CATEGORY_ID);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  if (groupBy === 'priority') {
    // Every task has a priority (schema default), so there's no catch-all
    // column. Order most-urgent first — TASK_PRIORITIES runs low→urgent, so
    // reverse it — and colour each header dot with the priority accent.
    const columns: CarouselColumn[] = [...TASK_PRIORITIES].reverse().map((p) => ({
      key: p,
      label: prettyPriority(p),
      color: PRIORITY_BORDER[p],
      tasks: buckets.get(p) ?? [],
    }));
    return emptyLast(columns);
  }

  if (groupBy === 'type') {
    const columns: CarouselColumn[] = TASK_TYPES.map((t) => ({
      key: t,
      label: prettyType(t),
      color: null,
      icon: TYPE_META[t].icon,
      iconClass: TYPE_META[t].text,
      tasks: buckets.get(t) ?? [],
    }));
    // Same rule as Uncategorized: only worth a swipe when it holds something.
    const untyped = buckets.get(NO_TYPE);
    if (untyped?.length) {
      columns.push({ key: NO_TYPE, label: 'No type', color: null, tasks: untyped });
    }
    return emptyLast(columns);
  }

  const columns: CarouselColumn[] = categories.map((c) => ({
    key: c.id,
    label: c.name,
    color: c.color,
    tasks: buckets.get(c.id) ?? [],
  }));

  // Uncategorized is only worth a column (and a chip) when something lives
  // there — an always-present empty column is just a dead swipe target.
  const orphans = buckets.get(NO_CATEGORY_ID);
  if (orphans?.length) {
    columns.push({ key: NO_CATEGORY_ID, label: 'Uncategorized', color: null, tasks: orphans });
  }
  return emptyLast(columns);
}

/**
 * Push the empty groups to the end so swiping walks the columns that actually
 * hold work first. Stable within each half, so categories keep their
 * user-defined `sortOrder` and types their enum order.
 */
function emptyLast(columns: CarouselColumn[]): CarouselColumn[] {
  return [
    ...columns.filter((c) => c.tasks.length > 0),
    ...columns.filter((c) => c.tasks.length === 0),
  ];
}

/**
 * Short, glanceable due label for the row's right edge: `overdue`, `today`,
 * `tomorrow`, `this week`, otherwise the month (`Apr`) — plus the year once
 * the date leaves the current one.
 */
export function relativeDueLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  // Compare calendar days, not instants: a due date stored at midnight UTC
  // shouldn't read as "overdue" for the whole of its own local day.
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((dueDay - today) / 86_400_000);

  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'this week';

  const month = due.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  return due.getUTCFullYear() === now.getFullYear()
    ? month
    : `${month} ${due.getUTCFullYear() % 100}`;
}

/** Full due date for the expanded row. */
export function formatDueDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
