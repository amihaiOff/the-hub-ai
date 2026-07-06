'use client';

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
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
import { TaskDetailSheet } from './task-detail-sheet';
import { TaskFiltersBar } from './task-filters-bar';

/**
 * Top-level Tasks page. Owns the current filter/view state and the
 * "currently open" task-detail id. Table view is the only view in v1
 * (Board + Calendar arrive in later phases).
 */
export function TasksClient() {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: tasks = [], isLoading, error } = useTasks(filters);
  const { data: categories = [] } = useTaskCategories();
  const { data: tags = [] } = useTaskTags();
  const createTask = useCreateTask();

  const handleQuickAdd = () => {
    // Simple quick-add — creates an empty task, then opens the detail
    // panel on it so the user can fill in the details.
    createTask.mutate(
      { title: 'New task' },
      {
        onSuccess: (task) => setDetailId(task.id),
      }
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Tasks</h1>
        <Button size="sm" onClick={handleQuickAdd} disabled={createTask.isPending}>
          {createTask.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          New task
        </Button>
      </div>

      <TaskFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        tags={tags}
      />

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      )}

      {error && (
        <div className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && tasks.length === 0 && !error && <TaskEmptyState onCreate={handleQuickAdd} />}

      {tasks.length > 0 && (
        <TaskTableView
          tasks={tasks as TaskRow[]}
          categories={categories}
          tags={tags}
          onOpenTask={setDetailId}
        />
      )}

      <TaskDetailSheet
        taskId={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        categories={categories}
        tags={tags}
      />
    </div>
  );
}

function TaskEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <p className="text-muted-foreground text-sm">No tasks yet.</p>
      <Button size="sm" variant="outline" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" /> Add your first task
      </Button>
    </div>
  );
}
