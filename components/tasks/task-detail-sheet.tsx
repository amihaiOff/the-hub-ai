'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CircleDot,
  Flag,
  FolderTree,
  Loader2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
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
import { TASK_PRIORITIES } from '@/lib/validations/tasks';
import { prettyPriority } from './task-filters-bar';

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
const PRIORITY_PILL: Record<TaskRow['priority'], string> = {
  URGENT: 'bg-red-500/15 text-red-300',
  HIGH: 'bg-orange-500/15 text-orange-300',
  MEDIUM: 'bg-yellow-500/15 text-yellow-300',
  LOW: 'bg-teal-500/15 text-teal-300',
};

export function TaskDetailSheet({ taskId, onOpenChange, categories }: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId);
  const open = !!taskId;

  // Browser Back closes the sheet in-app instead of leaving the tasks page.
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useBackToClose(open, close);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto rounded-l-3xl p-6 pt-12 sm:max-w-lg"
      >
        {isLoading || !task ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <TaskDetailBody key={task.id} task={task} categories={categories} onDeleted={close} />
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
      {/* Title — textarea so a long title wraps on mobile instead of
          horizontally overflowing. field-sizing-content grows the box to
          fit the content (Tailwind v4 utility), and Enter still commits
          the change so it doesn't turn into a multi-line input by
          accident. */}
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== task.title) patch('title', title.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (title.trim() && title !== task.title) patch('title', title.trim());
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
        rows={1}
        placeholder="Task title"
        className="placeholder:text-muted-foreground font-heading [field-sizing:content] w-full resize-none overflow-hidden border-none bg-transparent px-0 text-4xl leading-tight font-bold tracking-tight break-words shadow-none outline-none focus-visible:ring-0"
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
          {/* Free-text status label. Uncontrolled + keyed on the value so an
              external change resets it; commits on blur / Enter. */}
          <input
            key={task.status}
            defaultValue={task.status}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== task.status) patch('status', next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Add a status…"
            className="placeholder:text-muted-foreground hover:bg-muted/40 focus:bg-muted/40 h-8 w-44 rounded-full border-none bg-transparent px-3 text-xs font-medium outline-none"
          />
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
