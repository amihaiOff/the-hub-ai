'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
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
  useTasks,
  useTaskCategories,
  useTaskTags,
  useCreateTask,
  useDeleteTask,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import type { TaskFilters } from '@/lib/validations/tasks';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { TaskTableView } from './task-table-view';
import { TaskListView } from './task-list-view';
import { TaskKanbanView, type GroupBy } from './task-kanban-view';
import { TaskDetailSheet } from './task-detail-sheet';
import { TaskToolbar, type ViewOption } from './task-toolbar';
import { CategoryManagerDialog } from './category-manager-dialog';
import { QuickAddPopover } from './quick-add-popover';
import type { TaskSort } from './task-filters-bar';

type ViewMode = 'list' | 'kanban' | 'table';

const VIEW_OPTIONS: ViewOption[] = [
  { id: 'list', label: 'List', icon: ListIcon },
  { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { id: 'table', label: 'Table', icon: TableIcon },
];

// Sorting UI was removed; tasks always come back due-date-earliest-first.
const DEFAULT_SORT: TaskSort = 'due-asc';

const PRIORITY_ORDER: Record<TaskRow['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function TasksClient() {
  const [view, setView] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
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

  const handleQuickAdd = () => {
    createTask.mutate({ title: 'New task' }, { onSuccess: (task) => setDetailId(task.id) });
  };

  // Quick-add popover state. Short-press on the FAB opens it; long-press
  // falls through to handleQuickAdd (creates + opens the detail sheet).
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
  const handleQuickAddSubmit = (title: string, categoryId: string | null) => {
    createTask.mutate(
      { title, categoryId: categoryId ?? undefined },
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

      {!isLoading && tasks.length === 0 && !error && <TaskEmptyState onCreate={handleQuickAdd} />}

      {tasks.length > 0 && view === 'list' && (
        <TaskListView
          tasks={tasks}
          onOpenTask={setDetailId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onEnterSelection={enterSelection}
          onToggleSelection={toggleSelection}
        />
      )}
      {tasks.length > 0 && view === 'kanban' && (
        <TaskKanbanView
          tasks={tasks}
          categories={categories}
          onOpenTask={setDetailId}
          groupBy={groupBy}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onEnterSelection={enterSelection}
          onToggleSelection={toggleSelection}
        />
      )}
      {tasks.length > 0 && view === 'table' && (
        <TaskTableView tasks={tasks} categories={categories} tags={tags} onOpenTask={setDetailId} />
      )}

      {tasks.length > 0 && !selectionMode && (
        <div className="text-muted-foreground flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs">
          <span>
            Showing {tasks.length} of {tasks.length} tasks
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
            {...fabLongPress.handlers}
            onClick={handleFabClick}
            disabled={createTask.isPending}
            aria-label="New task (short press: quick add · long press: full editor)"
            title="Short press: quick add · Long press: full editor"
            className="bg-primary text-primary-foreground fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70"
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
      copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
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
