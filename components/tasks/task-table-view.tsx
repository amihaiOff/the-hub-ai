'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useUpdateTask,
  useDeleteTask,
  type TaskRow,
  type TaskCategoryRow,
  type TaskTagRow,
} from '@/lib/hooks/use-tasks';
import { TASK_PRIORITIES } from '@/lib/validations/tasks';
import { useToggleTaskDone } from './task-undo';
import { prettyPriority } from './task-filters-bar';

interface TaskTableViewProps {
  tasks: TaskRow[];
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
  onOpenTask: (id: string) => void;
}

/**
 * Notion-style row table with rounded chrome. Checkbox toggles DONE like
 * the list view; the rest of the row is inline-edit selects that PATCH via
 * useUpdateTask's optimistic path.
 */
export function TaskTableView({ tasks, categories, onOpenTask }: TaskTableViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="border-border/60 overflow-x-auto rounded-3xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b text-left">
          <tr>
            <Th className="w-10" />
            <Th className="min-w-[260px]">Task name</Th>
            <Th className="w-[140px]">Category</Th>
            <Th className="w-[140px]">Status</Th>
            <Th className="w-[120px]">Priority</Th>
            <Th className="w-[140px]">Due</Th>
            <Th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-border/60 divide-y">
          {tasks.map((task) => {
            const hasChildren = (task.children?.length ?? 0) > 0;
            const isOpen = expanded.has(task.id);
            return (
              <TaskRowEls
                key={task.id}
                task={task}
                categories={categories}
                isExpanded={isOpen}
                canExpand={hasChildren}
                onToggleExpand={() => toggle(task.id)}
                onOpen={() => onOpenTask(task.id)}
                depth={0}
              >
                {isOpen &&
                  task.children?.map((child) => (
                    <TaskRowEls
                      key={child.id}
                      task={child}
                      categories={categories}
                      isExpanded={false}
                      canExpand={false}
                      onToggleExpand={() => {}}
                      onOpen={() => onOpenTask(child.id)}
                      depth={1}
                    />
                  ))}
              </TaskRowEls>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'text-muted-foreground px-4 py-3 text-[10px] font-semibold tracking-wider uppercase',
        className
      )}
    >
      {children}
    </th>
  );
}

interface RowProps {
  task: TaskRow;
  categories: TaskCategoryRow[];
  isExpanded: boolean;
  canExpand: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
  depth: number;
  children?: React.ReactNode;
}

function TaskRowEls(props: RowProps) {
  const { task, categories, isExpanded, canExpand, onToggleExpand, onOpen, depth, children } =
    props;
  const update = useUpdateTask();
  const setDone = useToggleTaskDone();
  const del = useDeleteTask();
  const isChild = depth > 0;
  const isDone = task.done;

  return (
    <>
      <tr className={cn('hover:bg-muted/30 group transition-colors', isChild && 'bg-muted/10')}>
        <td className="w-10 px-4 py-3 align-middle">
          <div className="flex items-center gap-1.5">
            {canExpand ? (
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-muted-foreground hover:text-foreground"
                aria-label={isExpanded ? 'Collapse sub-tasks' : 'Expand sub-tasks'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              isChild && <span className="text-muted-foreground/50 text-xs">↳</span>
            )}
            <Checkbox
              checked={isDone}
              onCheckedChange={(v) => setDone(task, v === true)}
              className="h-4 w-4 rounded-md"
              aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
            />
          </div>
        </td>

        <td className={cn('px-4 py-3 align-middle', isChild && 'pl-8')}>
          <TitleCell
            task={task}
            onCommit={(next) => update.mutate({ id: task.id, patch: { title: next } })}
            onOpen={onOpen}
            done={isDone}
          />
        </td>

        <td className="px-4 py-3 align-middle">
          <CategoryCell
            categoryId={task.categoryId}
            categories={categories}
            onChange={(id) => update.mutate({ id: task.id, patch: { categoryId: id } })}
          />
        </td>

        <td className="px-4 py-3 align-middle">
          <StatusCell
            value={task.status}
            onChange={(v) => update.mutate({ id: task.id, patch: { status: v } })}
          />
        </td>

        <td className="px-4 py-3 align-middle">
          <PriorityCell
            value={task.priority}
            onChange={(v) => update.mutate({ id: task.id, patch: { priority: v } })}
          />
        </td>

        <td className="px-4 py-3 align-middle">
          <DueDateCell
            value={task.dueDate}
            onChange={(iso) => update.mutate({ id: task.id, patch: { dueDate: iso } })}
          />
        </td>

        <td className="w-8 px-2 py-3 align-middle">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem
                onClick={() => del.mutate(task.id)}
                className="text-destructive rounded-lg"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {children}
    </>
  );
}

function TitleCell({
  task,
  onCommit,
  onOpen,
  done,
}: {
  task: TaskRow;
  onCommit: (next: string) => void;
  onOpen: () => void;
  done: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={() => {
          setDraft(task.title);
          setEditing(true);
        }}
        className={cn(
          'hover:text-primary block w-full truncate text-left text-sm font-medium',
          done && 'text-muted-foreground line-through'
        )}
      >
        {task.title}
      </button>
    );
  }
  return (
    <input
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== task.title) onCommit(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (draft.trim() && draft !== task.title) onCommit(draft.trim());
          setEditing(false);
        } else if (e.key === 'Escape') {
          setDraft(task.title);
          setEditing(false);
        }
      }}
      className="border-input bg-background w-full rounded-xl border px-3 py-1.5 text-sm"
    />
  );
}

const NONE = '__none__';

function CategoryCell({
  categoryId,
  categories,
  onChange,
}: {
  categoryId: string | null;
  categories: TaskCategoryRow[];
  onChange: (id: string | null) => void;
}) {
  const selected = categories.find((c) => c.id === categoryId);
  return (
    <Select value={categoryId ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger
        className={cn(
          'h-7 w-fit rounded-full border-none px-3 text-xs',
          selected ? 'bg-primary/10 text-primary' : 'bg-transparent'
        )}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        <SelectItem value={NONE}>—</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusCell({
  value,
  onChange,
}: {
  value: TaskRow['status'];
  onChange: (v: TaskRow['status']) => void;
}) {
  // Free-text status. Uncontrolled + keyed on `value` so external (optimistic)
  // changes reset it without a setState-in-effect; commits on blur / Enter.
  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed !== value) onChange(trimmed);
  };
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="—"
      aria-label="Status"
      className="bg-muted/60 placeholder:text-muted-foreground focus:ring-primary/40 h-7 w-28 rounded-full border-none px-3 text-xs outline-none focus:ring-1"
    />
  );
}

function PriorityCell({
  value,
  onChange,
}: {
  value: TaskRow['priority'];
  onChange: (v: TaskRow['priority']) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskRow['priority'])}>
      <SelectTrigger className="h-7 border-none bg-transparent px-2 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        {TASK_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {prettyPriority(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DueDateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const asInput = value ? value.slice(0, 10) : '';
  return (
    <input
      type="date"
      value={asInput}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? `${v}T00:00:00.000Z` : null);
      }}
      className="text-muted-foreground rounded-lg border-none bg-transparent px-1 py-0.5 text-xs"
    />
  );
}
