'use client';

import Link from 'next/link';
import { AlertCircle, ChevronRight, FolderTree, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useTasks,
  useTaskCategories,
  type TaskCategoryRow,
  type TaskRow,
} from '@/lib/hooks/use-tasks';

const UNCATEGORIZED_KEY = '__uncategorized__';

// Priority ordering used to sort tasks inside each category. Same order the
// list view uses; keeps parity across surfaces.
const PRIORITY_ORDER: Record<TaskRow['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Dashboard tile: shows URGENT open (not-done) tasks, grouped by category.
 * Clicking a task jumps to the tasks page — no inline edit here, this is a
 * read/scan surface.
 */
export function TasksSummaryCard() {
  const { data: tasks = [], isLoading, error } = useTasks();
  const { data: categories = [] } = useTaskCategories();

  const visible = (tasks as TaskRow[]).filter(
    (t) => t.priority === 'URGENT' && !t.done && t.parentTaskId == null
  );

  const groups = groupByCategory(visible, categories);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Tasks</CardTitle>
        <Link
          href="/tasks"
          className="text-muted-foreground hover:text-foreground text-xs"
          aria-label="Open tasks page"
        >
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && visible.length === 0 && (
          <p className="text-muted-foreground text-sm">Nothing urgent right now.</p>
        )}

        {!isLoading && !error && visible.length > 0 && (
          <div className="space-y-4">
            {groups.map((group) => (
              <CategoryGroup key={group.key} group={group} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CategoryGroup {
  key: string;
  label: string;
  color: string | null;
  tasks: TaskRow[];
}

function groupByCategory(tasks: TaskRow[], categories: TaskCategoryRow[]): CategoryGroup[] {
  // Preserve the user's own category ordering (sortOrder from useTaskCategories).
  const byId = new Map<string, CategoryGroup>();
  for (const c of categories) {
    byId.set(c.id, { key: c.id, label: c.name, color: c.color ?? null, tasks: [] });
  }
  const uncategorized: CategoryGroup = {
    key: UNCATEGORIZED_KEY,
    label: 'Uncategorized',
    color: null,
    tasks: [],
  };

  for (const t of tasks) {
    const bucket = t.categoryId ? byId.get(t.categoryId) : undefined;
    (bucket ?? uncategorized).tasks.push(t);
  }

  const ordered: CategoryGroup[] = [];
  for (const c of categories) {
    const g = byId.get(c.id);
    if (g && g.tasks.length > 0) ordered.push(g);
  }
  if (uncategorized.tasks.length > 0) ordered.push(uncategorized);

  // Sort inside each group by priority so URGENT surfaces first.
  for (const g of ordered) {
    g.tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
  return ordered;
}

function CategoryGroup({ group }: { group: CategoryGroup }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <FolderTree
          className="h-3.5 w-3.5"
          style={group.color ? { color: group.color } : undefined}
        />
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          {group.label}
        </span>
        <span className="text-muted-foreground/70 text-[10px]">· {group.tasks.length}</span>
      </div>
      <ul className="space-y-1">
        {group.tasks.map((task) => (
          <li key={task.id}>
            <Link
              href="/tasks"
              className="hover:bg-muted/40 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
            >
              <PriorityDot priority={task.priority} />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm">{task.title}</span>
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriorityDot({ priority }: { priority: TaskRow['priority'] }) {
  if (priority === 'URGENT') {
    return <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Urgent" />;
  }
  if (priority === 'HIGH') {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="High" />;
  }
  // MEDIUM — quiet dot to keep the row readable
  return (
    <span
      className={cn('bg-muted-foreground/50 h-2 w-2 shrink-0 rounded-full')}
      aria-label="Medium"
    />
  );
}
