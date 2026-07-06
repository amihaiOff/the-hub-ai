'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  type TaskCategoryRow,
  type TaskTagRow,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/validations/tasks';
import { prettyStatus, prettyPriority } from './task-filters-bar';

interface TaskDetailSheetProps {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
}

const NONE = '__none__';

/**
 * Right-side detail panel. Owns the Sheet frame + the task query; the body
 * is a keyed inner component that seeds its local title/notes state from
 * the initial task so we avoid a useEffect-driven sync (and the lint rule
 * against setState-in-effect).
 */
export function TaskDetailSheet({ taskId, onOpenChange, categories, tags }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId);

  return (
    <Sheet open={!!taskId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Task</SheetTitle>
        </SheetHeader>

        {isLoading || !task ? (
          <div className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          // Key on task.id so the inner body remounts (and reseeds its
          // local title/notes state) whenever a different task is opened.
          <TaskDetailBody
            key={task.id}
            task={task}
            categories={categories}
            tags={tags}
            onDeleted={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({
  task,
  categories,
  onDeleted,
}: {
  task: TaskRow;
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
  onDeleted: () => void;
}) {
  const update = useUpdateTask();
  const del = useDeleteTask();

  // Local drafts so typing doesn't fire a PATCH per keystroke — commit on
  // blur / Enter. Seed once via useState initializer; the parent's `key`
  // handles resetting when the user opens a different task.
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');

  const patch = (field: string, value: unknown) => {
    update.mutate({ id: task.id, patch: { [field]: value } });
  };

  return (
    <div className="mt-4 space-y-5">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== task.title) patch('title', title.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim() && title !== task.title)
            patch('title', title.trim());
        }}
        className="border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
        placeholder="Task title"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={task.status} onValueChange={(v) => patch('status', v)}>
            <SelectTrigger className="h-8">
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
        </Field>

        <Field label="Priority">
          <Select value={task.priority} onValueChange={(v) => patch('priority', v)}>
            <SelectTrigger className="h-8">
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
        </Field>

        <Field label="Category">
          <Select
            value={task.categoryId ?? NONE}
            onValueChange={(v) => patch('categoryId', v === NONE ? null : v)}
          >
            <SelectTrigger className="h-8">
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
        </Field>

        <Field label="Due date">
          <Input
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
            onChange={(e) =>
              patch('dueDate', e.target.value ? `${e.target.value}T00:00:00.000Z` : null)
            }
            className="h-8"
          />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (task.notes ?? '')) patch('notes', notes || null);
          }}
          rows={6}
          placeholder="Anything you want to remember about this task…"
        />
      </Field>

      <div className="border-border/40 border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            del.mutate(task.id, { onSuccess: onDeleted });
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete task
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}
