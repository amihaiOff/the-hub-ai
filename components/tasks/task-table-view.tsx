'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/validations/tasks';
import { prettyStatus, prettyPriority } from './task-filters-bar';

interface TaskTableViewProps {
  tasks: TaskRow[];
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
  onOpenTask: (id: string) => void;
}

/**
 * Notion-style row table. Inline edits are one-field PATCHes and rely on
 * the optimistic updates in useUpdateTask, so cells feel instant.
 * Sub-tasks (one level) are rendered indented under their parent when
 * expanded — child rows omit the expand column and support the same
 * inline edits.
 */
export function TaskTableView({ tasks, categories, tags, onOpenTask }: TaskTableViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b text-left">
          <tr>
            <Th className="w-8" />
            <Th className="min-w-[260px]">Title</Th>
            <Th className="w-[140px]">Category</Th>
            <Th className="w-[140px]">Status</Th>
            <Th className="w-[110px]">Priority</Th>
            <Th className="w-[130px]">Due</Th>
            <Th className="w-[140px]">Assignee</Th>
            <Th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {tasks.map((task) => {
            const hasChildren = (task.children?.length ?? 0) > 0;
            const isOpen = expanded.has(task.id);
            return (
              <TaskRowEls
                key={task.id}
                task={task}
                categories={categories}
                tags={tags}
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
                      tags={tags}
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
        'text-muted-foreground px-2 py-2 text-[10px] font-semibold tracking-wider uppercase',
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
  tags: TaskTagRow[];
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
  const del = useDeleteTask();
  const isChild = depth > 0;

  return (
    <>
      <tr className={cn('hover:bg-muted/30 group', isChild && 'bg-muted/10')}>
        <td className="w-8 px-2 py-1.5 align-middle">
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
            isChild && <span className="text-muted-foreground/50 ml-2 text-xs">↳</span>
          )}
        </td>

        <td className={cn('px-2 py-1.5 align-middle', isChild && 'pl-6')}>
          <TitleCell
            task={task}
            onCommit={(next) => update.mutate({ id: task.id, patch: { title: next } })}
            onOpen={onOpen}
          />
        </td>

        <td className="px-2 py-1.5 align-middle">
          <CategoryCell
            categoryId={task.categoryId}
            categories={categories}
            onChange={(id) => update.mutate({ id: task.id, patch: { categoryId: id } })}
          />
        </td>

        <td className="px-2 py-1.5 align-middle">
          <StatusCell
            value={task.status}
            onChange={(v) => update.mutate({ id: task.id, patch: { status: v } })}
          />
        </td>

        <td className="px-2 py-1.5 align-middle">
          <PriorityCell
            value={task.priority}
            onChange={(v) => update.mutate({ id: task.id, patch: { priority: v } })}
          />
        </td>

        <td className="px-2 py-1.5 align-middle">
          <DueDateCell
            value={task.dueDate}
            onChange={(iso) => update.mutate({ id: task.id, patch: { dueDate: iso } })}
          />
        </td>

        <td className="text-muted-foreground px-2 py-1.5 align-middle text-xs">
          {task.assignee?.name ?? '—'}
        </td>

        <td className="w-8 px-2 py-1.5 align-middle">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => del.mutate(task.id)} className="text-destructive">
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

// ─── Cell components ────────────────────────────────────────────────────

function TitleCell({
  task,
  onCommit,
  onOpen,
}: {
  task: TaskRow;
  onCommit: (next: string) => void;
  onOpen: () => void;
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
        className="hover:text-primary block w-full truncate text-left text-sm"
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
      className="border-input bg-background w-full rounded border px-2 py-0.5 text-sm"
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
  return (
    <Select value={categoryId ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger className="h-7 border-none bg-transparent px-2 text-xs">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
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
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskRow['status'])}>
      <SelectTrigger className="h-7 border-none bg-transparent px-2 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {prettyStatus(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <SelectContent>
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
      className="text-muted-foreground border-none bg-transparent px-1 py-0.5 text-xs"
    />
  );
}
