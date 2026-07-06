'use client';

import { useMemo, useState } from 'react';
import { KanbanSquare, List as ListIcon, Loader2, Plus, Table as TableIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useTasks,
  useTaskCategories,
  useTaskTags,
  useCreateTask,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import type { TaskFilters } from '@/lib/validations/tasks';
import { TaskTableView } from './task-table-view';
import { TaskListView } from './task-list-view';
import { TaskKanbanView, type GroupBy } from './task-kanban-view';
import { TaskDetailSheet } from './task-detail-sheet';
import { TaskToolbar, type ViewOption } from './task-toolbar';
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
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters = useMemo<TaskFilters>(() => {
    const term = search.trim();
    return term ? { search: term } : {};
  }, [search]);

  const { data: rawTasks = [], isLoading, error } = useTasks(filters);
  const { data: categories = [] } = useTaskCategories();
  const { data: tags = [] } = useTaskTags();
  const createTask = useCreateTask();

  const tasks = useMemo(() => sortTasks(rawTasks as TaskRow[], DEFAULT_SORT), [rawTasks]);

  const handleQuickAdd = () => {
    createTask.mutate({ title: 'New task' }, { onSuccess: (task) => setDetailId(task.id) });
  };

  return (
    <div className="space-y-5">
      {/* Collapsible toolbar: search + view type + group by, all on one line */}
      <TaskToolbar
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        viewOptions={VIEW_OPTIONS}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
      />

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
        <TaskListView tasks={tasks} onOpenTask={setDetailId} />
      )}
      {tasks.length > 0 && view === 'kanban' && (
        <TaskKanbanView
          tasks={tasks}
          categories={categories}
          onOpenTask={setDetailId}
          groupBy={groupBy}
        />
      )}
      {tasks.length > 0 && view === 'table' && (
        <TaskTableView tasks={tasks} categories={categories} tags={tags} onOpenTask={setDetailId} />
      )}

      {tasks.length > 0 && (
        <div className="text-muted-foreground flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs">
          <span>
            Showing {tasks.length} of {tasks.length} tasks
          </span>
        </div>
      )}

      <TaskDetailSheet
        taskId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        categories={categories}
        tags={tags}
      />

      {/* Floating action button — create a new task */}
      <button
        type="button"
        onClick={handleQuickAdd}
        disabled={createTask.isPending}
        aria-label="New task"
        title="New task"
        className="bg-primary text-primary-foreground fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70"
      >
        {createTask.isPending ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>
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
