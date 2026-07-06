'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CircleDot,
  Flag,
  FolderTree,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotesEditor } from './notes-editor';
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

// Pastel pill colors that match the semantic meaning of each value. The
// triggers become tinted chips so the selected value pops without being
// loud — /15 background + /90 text keeps it soft.
const STATUS_PILL: Record<TaskRow['status'], string> = {
  TODO: 'bg-slate-500/15 text-slate-300',
  IN_PROGRESS: 'bg-sky-500/15 text-sky-300',
  BLOCKED: 'bg-amber-500/15 text-amber-300',
  DONE: 'bg-emerald-500/15 text-emerald-300',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

const PRIORITY_PILL: Record<TaskRow['priority'], string> = {
  URGENT: 'bg-red-500/15 text-red-300',
  HIGH: 'bg-orange-500/15 text-orange-300',
  MEDIUM: 'bg-yellow-500/15 text-yellow-300',
  LOW: 'bg-teal-500/15 text-teal-300',
};

export function TaskDetailSheet({ taskId, onOpenChange, categories }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId);

  return (
    <Sheet open={!!taskId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto rounded-l-3xl p-6 sm:max-w-lg">
        <div className="mb-6 flex items-center">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="text-primary hover:bg-primary/10 flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !task ? (
          <div className="text-muted-foreground mt-6 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <TaskDetailBody
            key={task.id}
            task={task}
            categories={categories}
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
  onDeleted: () => void;
}) {
  const update = useUpdateTask();
  const del = useDeleteTask();

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');

  const patch = (field: string, value: unknown) => {
    update.mutate({ id: task.id, patch: { [field]: value } });
  };

  // Notes autosave. Refs let the unmount cleanup — which closes over
  // the initial render — still see the latest typed value + latest
  // mutation function. Refs are synced inside an effect (not during
  // render) per React 19's ref-safety rule.
  const savedNotesRef = useRef(task.notes ?? '');
  const notesRef = useRef(notes);
  const taskIdRef = useRef(task.id);
  const mutateRef = useRef(update.mutate);

  useEffect(() => {
    notesRef.current = notes;
    taskIdRef.current = task.id;
    mutateRef.current = update.mutate;
  });

  const flushNotes = () => {
    const value = notesRef.current;
    if (value === savedNotesRef.current) return;
    savedNotesRef.current = value;
    mutateRef.current({
      id: taskIdRef.current,
      patch: { notes: value.length > 0 ? value : null },
    });
  };

  // Debounced autosave: 400ms after the last keystroke. Cleanup cancels
  // the pending timer; the unmount effect below performs the final flush
  // so a rapid close-after-typing still saves.
  useEffect(() => {
    const id = setTimeout(flushNotes, 400);
    return () => clearTimeout(id);
  }, [notes]);

  useEffect(() => {
    return () => flushNotes();
  }, []);

  return (
    <div className="space-y-5">
      {/* Title */}
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
        className="h-auto border-none px-0 text-3xl font-semibold tracking-[0.2em] uppercase shadow-none focus-visible:ring-0"
        placeholder="Task title"
      />

      {/* Metadata rows — icon+label per row, values inline. Each icon
          gets its own accent color so the row scannable at a glance;
          the dropdown triggers themselves stay transparent to keep the
          block feeling like a list of properties, not a form. */}
      <div className="space-y-4">
        <MetaRow icon={FolderTree} label="Category" iconClass="text-violet-400/70">
          <Select
            value={task.categoryId ?? NONE}
            onValueChange={(v) => patch('categoryId', v === NONE ? null : v)}
          >
            <SelectTrigger className="hover:bg-muted/40 h-8 w-fit rounded-full border-none bg-transparent px-2 text-xs">
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
        </MetaRow>

        <MetaRow icon={CircleDot} label="Status" iconClass="text-blue-400/70">
          <Select value={task.status} onValueChange={(v) => patch('status', v)}>
            <SelectTrigger
              className={cn(
                'h-8 w-fit rounded-full border-none px-3 text-xs font-medium',
                STATUS_PILL[task.status]
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {prettyStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MetaRow>

        <MetaRow icon={Flag} label="Priority" iconClass="text-rose-400/70">
          <Select value={task.priority} onValueChange={(v) => patch('priority', v)}>
            <SelectTrigger
              className={cn(
                'h-8 w-fit rounded-full border-none px-3 text-xs font-medium',
                PRIORITY_PILL[task.priority]
              )}
            >
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
        </MetaRow>

        <MetaRow icon={CalendarIcon} label="Due Date" iconClass="text-emerald-400/70">
          <Input
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
            onChange={(e) =>
              patch('dueDate', e.target.value ? `${e.target.value}T00:00:00.000Z` : null)
            }
            className="hover:bg-muted/40 h-8 w-fit rounded-full border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
          />
        </MetaRow>
      </div>

      {/* Notes — Tiptap-powered markdown editor. Toolbar (Bold, Italic,
          Strikethrough, Bullet list, Ordered list, Link) drives real
          editor commands; the stored value is markdown. */}
      <div className="border-border/40 space-y-3 border-t pt-5">
        <h3 className="text-muted-foreground text-sm font-semibold tracking-[0.2em] uppercase">
          Task Notes
        </h3>
        <NotesEditor
          value={notes}
          onChange={setNotes}
          onBlur={flushNotes}
          placeholder="Anything you want to remember about this task…"
        />
      </div>

      <div className="border-border/40 border-t pt-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete task"
          title="Delete task"
          className="text-destructive hover:bg-destructive/10 h-9 w-9 rounded-xl"
          onClick={() => del.mutate(task.id, { onSuccess: onDeleted })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  iconClass,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-muted-foreground flex w-32 items-center gap-2.5 text-sm">
        <Icon className={cn('h-4 w-4', iconClass)} />
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
