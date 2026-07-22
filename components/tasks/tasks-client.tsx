'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  KanbanSquare,
  List as ListIcon,
  Loader2,
  Plus,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  useTasks,
  useTaskCategories,
  useTaskTags,
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import type { TaskFilters } from '@/lib/validations/tasks';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { TaskTableView } from './task-table-view';
import { TaskListView } from './task-list-view';
import { TaskKanbanView, type GroupBy } from './task-kanban-view';
import { TaskCalendarView, type CalendarMode } from './task-calendar-view';
import { TaskArchive } from './task-archive';
import { TaskDetailSheet } from './task-detail-sheet';
import { TaskToolbar, type ViewOption } from './task-toolbar';
import { CategoryManagerDialog } from './category-manager-dialog';
import { QuickAddPopover, type QuickAddOptions } from './quick-add-popover';
import { TaskUndoButton } from './task-undo';
import type { TaskSort } from './task-filters-bar';

type ViewMode = 'list' | 'kanban' | 'table' | 'calendar';

const VIEW_OPTIONS: ViewOption[] = [
  { id: 'list', label: 'List', icon: ListIcon },
  { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

// No sort UI; tasks are ordered by urgency (priority), earliest due date breaking ties.
const DEFAULT_SORT: TaskSort = 'priority';

const PRIORITY_ORDER: Record<TaskRow['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function TasksClient() {
  const [view, setView] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [calendarView, setCalendarView] = useState<CalendarMode>('month');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Multi-select (entered by long-pressing a card).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const deletingRef = useRef(false);

  const filters = useMemo<TaskFilters>(() => {
    const term = search.trim();
    return term ? { search: term } : {};
  }, [search]);

  const { data: rawTasks = [], isLoading, error } = useTasks(filters);
  const { data: categories = [] } = useTaskCategories();
  const { data: tags = [] } = useTaskTags();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();

  const tasks = useMemo(() => sortTasks(rawTasks as TaskRow[], DEFAULT_SORT), [rawTasks]);
  // Done tasks are pulled out of the active views into the Archive section at
  // the bottom; marking a card done moves it there (and back when un-done).
  const activeTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.done), [tasks]);

  // Calendar-view drag: drop an archive task onto a day cell to reschedule
  // it. The day droppables use ids of the form `day:YYYY-MM-DD`; archive
  // draggables use `task:<id>`. Reuses the same MouseSensor / TouchSensor
  // pattern the kanban uses so vertical scrolls on mobile don't accidentally
  // pick up a card.
  const updateTask = useUpdateTask();
  const calendarDndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );
  const handleCalendarDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id ?? '');
      const overId = event.over ? String(event.over.id) : '';
      if (!activeId.startsWith('task:') || !overId.startsWith('day:')) return;
      const taskId = activeId.slice('task:'.length);
      const dayKey = overId.slice('day:'.length);
      // Un-archive so the task appears on the calendar right away, and stamp
      // the new due date using the same YYYY-MM-DDT00:00:00.000Z format the
      // detail sheet writes.
      updateTask.mutate({
        id: taskId,
        patch: { done: false, dueDate: `${dayKey}T00:00:00.000Z` },
      });
    },
    [updateTask]
  );

  const handleQuickAdd = () => {
    createTask.mutate({ title: 'New task' }, { onSuccess: (task) => setDetailId(task.id) });
  };

  // Calendar view: create a task already due on the tapped day, then open it.
  const handleAddTaskOnDate = useCallback(
    (dueDate: string) => {
      createTask.mutate(
        { title: 'New task', dueDate },
        { onSuccess: (task) => setDetailId(task.id) }
      );
    },
    [createTask]
  );

  // Quick-add popover state. Short-press on the FAB opens it; long-press
  // falls through to handleQuickAdd (creates + opens the detail sheet).
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Lift the FAB (and, by extension, the anchored quick-add popover)
  // above the mobile keyboard when it opens — the layout viewport
  // doesn't shrink, so a fixed-bottom element sits behind the keyboard
  // otherwise.
  const keyboardInset = useKeyboardInset();
  // The FAB's `bottom` value is a style change, not a size change, so
  // Radix's Floating UI won't recompute the popover position on its
  // own. Dispatch a resize whenever the inset changes to force it.
  useEffect(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
  }, [keyboardInset]);
  const fabLongPress = useLongPress(
    () => {
      // A long press fires this and marks the click as consumed; the
      // onClick below then no-ops instead of opening the popover.
      handleQuickAdd();
    },
    { delay: 450 }
  );
  const handleFabClick = () => {
    if (fabLongPress.consumedClick()) return;
    setQuickAddOpen(true);
  };
  const handleQuickAddSubmit = (title: string, opts: QuickAddOptions) => {
    createTask.mutate(
      {
        title,
        categoryId: opts.categoryId ?? undefined,
        priority: opts.priority,
        dueDate: opts.dueDate ?? undefined,
      },
      { onSuccess: () => setQuickAddOpen(false) }
    );
  };

  const enterSelection = useCallback((id: string) => {
    setDeleteError(null);
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setDeleteError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Leaving nothing selected exits selection mode.
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDeleteError(null);
    setConfirmOpen(false);
  }, []);

  // Browser Back cancels selection mode instead of leaving the tasks page.
  useBackToClose(selectionMode, exitSelection);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) setDetailId(null);
  }, []);

  const handleDeleteSelected = async () => {
    // Guard against a double-tap firing two delete passes before isPending flips.
    if (deletingRef.current) return;
    deletingRef.current = true;
    const ids = [...selectedIds];
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteTask.mutateAsync(id)));
      const failed = ids.filter((_, i) => results[i].status === 'rejected');
      setConfirmOpen(false);
      if (failed.length === 0) {
        exitSelection();
      } else {
        // Keep the ones that failed selected so the user can retry.
        setSelectedIds(new Set(failed));
        setDeleteError(
          `Couldn't delete ${failed.length} of ${ids.length} task${ids.length === 1 ? '' : 's'}. Please try again.`
        );
      }
    } finally {
      deletingRef.current = false;
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Tasks</h1>
      {/* Selection bar replaces the toolbar while picking multiple tasks. */}
      {selectionMode ? (
        <div className="space-y-2">
          <div className="border-border/60 bg-card flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exitSelection}
                aria-label="Cancel selection"
                className="hover:bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
            </div>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedIds.size === 0}
              className="text-destructive hover:bg-destructive/10 h-9 rounded-xl"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
          {deleteError && <p className="text-destructive px-1 text-xs">{deleteError}</p>}
        </div>
      ) : (
        /* Collapsible toolbar: search + view type + group by + manage
           categories, all aligned on the left. */
        <TaskToolbar
          search={search}
          onSearchChange={setSearch}
          view={view}
          onViewChange={setView}
          viewOptions={VIEW_OPTIONS}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          calendarView={calendarView}
          onCalendarViewChange={setCalendarView}
          onManageCategories={() => setCategoryManagerOpen(true)}
        />
      )}

      {/* Body */}
      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      )}

      {error && (
        <div className="border-destructive text-destructive rounded-2xl border px-4 py-3 text-sm">
          {(error as Error).message}
        </div>
      )}

      {!isLoading &&
        activeTasks.length === 0 &&
        doneTasks.length === 0 &&
        !error &&
        view !== 'calendar' && <TaskEmptyState onCreate={handleQuickAdd} />}

      {/* Calendar renders even with no tasks so days can still be scheduled.
          Keyed on the mode so switching week/month re-anchors on today.
          Wrapped in a DndContext so archived tasks can be dragged onto a
          day cell to reschedule + un-archive in one gesture. */}
      {!isLoading && !error && view === 'calendar' && (
        <DndContext sensors={calendarDndSensors} onDragEnd={handleCalendarDragEnd}>
          <div className="space-y-4">
            <TaskCalendarView
              key={calendarView}
              mode={calendarView}
              tasks={activeTasks}
              onOpenTask={setDetailId}
              onAddTaskOnDate={handleAddTaskOnDate}
            />
            {doneTasks.length > 0 && (
              <TaskArchive tasks={doneTasks} onOpenTask={setDetailId} draggable />
            )}
          </div>
        </DndContext>
      )}

      {activeTasks.length > 0 && view === 'list' && (
        <TaskListView
          tasks={activeTasks}
          onOpenTask={setDetailId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onEnterSelection={enterSelection}
          onToggleSelection={toggleSelection}
        />
      )}
      {activeTasks.length > 0 && view === 'kanban' && (
        <TaskKanbanView
          tasks={activeTasks}
          categories={categories}
          onOpenTask={setDetailId}
          groupBy={groupBy}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onEnterSelection={enterSelection}
          onToggleSelection={toggleSelection}
        />
      )}
      {activeTasks.length > 0 && view === 'table' && (
        <TaskTableView
          tasks={activeTasks}
          categories={categories}
          tags={tags}
          onOpenTask={setDetailId}
        />
      )}

      {/* Archive — done tasks, collapsed at the bottom. */}
      {doneTasks.length > 0 && !selectionMode && view !== 'calendar' && (
        <TaskArchive tasks={doneTasks} onOpenTask={setDetailId} />
      )}

      {activeTasks.length > 0 && !selectionMode && (
        <div className="text-muted-foreground flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs">
          <span>
            Showing {activeTasks.length} active
            {doneTasks.length > 0 ? ` · ${doneTasks.length} archived` : ''}
          </span>
        </div>
      )}

      <TaskDetailSheet
        taskId={detailId}
        onOpenChange={handleDetailOpenChange}
        categories={categories}
        tags={tags}
      />

      <CategoryManagerDialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} />

      {/* Floating Undo — appears bottom-left for a few seconds after a task is
          marked done, restoring its previous status on tap. */}
      <TaskUndoButton />

      {/* Confirm bulk delete */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} task{selectedIds.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteTask.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteSelected}
              disabled={deleteTask.isPending}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleteTask.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating action button — short press opens the quick-add
          popover, long press falls through to the full detail sheet. */}
      {!selectionMode && (
        <QuickAddPopover
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          categories={categories}
          isSubmitting={createTask.isPending}
          onSubmit={handleQuickAddSubmit}
        >
          <button
            type="button"
            // bindRef (native passive listeners) instead of {...handlers}
            // — spreading React synthetic onPointerDown here causes
            // react-dom to install non-passive document pointer delegates
            // that stall the first touch scroll on iOS.
            ref={fabLongPress.bindRef}
            onClick={handleFabClick}
            disabled={createTask.isPending}
            aria-label="New task (short press: quick add · long press: full editor)"
            title="Short press: quick add · Long press: full editor"
            style={{
              bottom: `calc(1.25rem + env(safe-area-inset-bottom) + ${keyboardInset}px)`,
              transition: 'bottom 180ms ease-out',
            }}
            className="bg-primary text-primary-foreground fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70"
          >
            {createTask.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Plus className="h-6 w-6" />
            )}
          </button>
        </QuickAddPopover>
      )}
    </div>
  );
}

function TaskEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border/70 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed p-10 text-center">
      <p className="text-muted-foreground text-sm">No tasks yet.</p>
      <Button
        size="icon"
        variant="outline"
        onClick={onCreate}
        className="h-11 w-11 rounded-2xl"
        aria-label="Add your first task"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}

function sortTasks(tasks: TaskRow[], sort: TaskSort): TaskRow[] {
  const copy = [...tasks];
  switch (sort) {
    case 'due-asc':
      copy.sort((a, b) => dateCmp(a.dueDate, b.dueDate));
      break;
    case 'due-desc':
      copy.sort((a, b) => dateCmp(b.dueDate, a.dueDate));
      break;
    case 'priority':
      copy.sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || dateCmp(a.dueDate, b.dueDate)
      );
      break;
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'created':
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
  }
  return copy;
}

function dateCmp(a: string | null, b: string | null): number {
  // Nulls sort last on ascending; the negation on the desc branch flips this.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}
