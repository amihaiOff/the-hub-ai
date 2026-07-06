'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Calendar as CalendarIcon,
  CircleDot,
  Flag,
  FolderTree,
  Link2,
  List,
  Loader2,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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

export function TaskDetailSheet({ taskId, onOpenChange, categories }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId);

  return (
    <Sheet open={!!taskId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto rounded-l-3xl sm:max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="text-primary hover:bg-primary/10 flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">Task Details</h2>
          </div>
          <div className="flex items-center gap-1">
            <IconBtn label="Share">
              <Share2 className="h-4 w-4" />
            </IconBtn>
          </div>
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

function IconBtn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="text-muted-foreground hover:bg-muted/60 flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
    >
      {children}
    </button>
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
        className="h-auto border-none px-0 text-2xl font-bold shadow-none focus-visible:ring-0"
        placeholder="Task title"
      />

      {/* Metadata rows — icon+label per row, values inline. */}
      <div className="space-y-4">
        <MetaRow icon={FolderTree} label="Category">
          <Select
            value={task.categoryId ?? NONE}
            onValueChange={(v) => patch('categoryId', v === NONE ? null : v)}
          >
            <SelectTrigger className="bg-muted/70 h-8 w-fit rounded-full border-none px-3 text-xs">
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

        <MetaRow icon={CircleDot} label="Status">
          <Select value={task.status} onValueChange={(v) => patch('status', v)}>
            <SelectTrigger className="bg-muted/70 h-8 w-fit rounded-full border-none px-3 text-xs">
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

        <MetaRow icon={Flag} label="Priority">
          <Select value={task.priority} onValueChange={(v) => patch('priority', v)}>
            <SelectTrigger className="bg-muted/70 h-8 w-fit rounded-full border-none px-3 text-xs">
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

        <MetaRow icon={CalendarIcon} label="Due Date">
          <Input
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
            onChange={(e) =>
              patch('dueDate', e.target.value ? `${e.target.value}T00:00:00.000Z` : null)
            }
            className="h-8 w-fit rounded-xl border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
          />
        </MetaRow>
      </div>

      {/* Notes with a decorative rich-text toolbar (buttons don't format
          yet — kept as visual affordance matching the mock). */}
      <div className="border-border/40 space-y-3 border-t pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">Notes</h3>
          <div className="text-muted-foreground flex items-center gap-1">
            <NotesTool label="Bold">
              <Bold className="h-3.5 w-3.5" />
            </NotesTool>
            <NotesTool label="List">
              <List className="h-3.5 w-3.5" />
            </NotesTool>
            <NotesTool label="Link">
              <Link2 className="h-3.5 w-3.5" />
            </NotesTool>
          </div>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={flushNotes}
          rows={8}
          placeholder="Anything you want to remember about this task…"
          className="bg-muted/40 rounded-2xl border-none focus-visible:ring-0"
        />
      </div>

      <div className="border-border/40 border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive rounded-xl"
          onClick={() => del.mutate(task.id, { onSuccess: onDeleted })}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete task
        </Button>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-muted-foreground flex w-32 items-center gap-2.5 text-sm">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NotesTool({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'hover:bg-muted/60 flex h-7 w-7 items-center justify-center rounded-lg transition-colors'
      )}
    >
      {children}
    </button>
  );
}
