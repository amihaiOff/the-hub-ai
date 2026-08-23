'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  CircleDot,
  Flag,
  FolderTree,
  Layers,
  ListTree,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  type TaskCategoryRow,
  type TaskTagRow,
  type TaskRow,
} from '@/lib/hooks/use-tasks';
import { TASK_PRIORITIES, TASK_TYPES } from '@/lib/validations/tasks';
import { prettyPriority, prettyType } from './task-filters-bar';
import { TYPE_META } from './task-list-view';
import { useToggleTaskDone } from './task-undo';

interface TaskDetailSheetProps {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
  /**
   * Present the same editor edge-to-edge instead of as a side sheet. Used by
   * the carousel view, where a long press opens the task full-screen.
   */
  fullScreen?: boolean;
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

export function TaskDetailSheet({
  taskId,
  onOpenChange,
  categories,
  fullScreen = false,
}: TaskDetailSheetProps) {
  const open = !!taskId;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'overflow-y-auto',
          fullScreen
            ? // Edge-to-edge: no rounding, no max width, and safe-area padding
              // so the title clears the notch and the footer the home indicator.
              'safe-pt safe-pb inset-0 w-full max-w-none rounded-none border-none px-5 [--safe-pb-base:1.25rem] [--safe-pt-base:3rem] sm:max-w-none'
            : 'w-full rounded-l-3xl p-6 pt-12 sm:max-w-lg'
        )}
      >
        {taskId && (
          // Keyed by the root taskId so the internal nav stack resets when
          // the parent opens the sheet on a different task — much simpler
          // than a prop-derived useEffect reset.
          <SheetInner
            key={taskId}
            rootTaskId={taskId}
            categories={categories}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetInner({
  rootTaskId,
  categories,
  onClose,
}: {
  rootTaskId: string;
  categories: TaskCategoryRow[];
  onClose: () => void;
}) {
  const [stack, setStack] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string>(rootTaskId);
  const { data: task, isLoading } = useTask(currentId);

  const pushChild = useCallback(
    (childId: string) => {
      setStack((s) => [...s, currentId]);
      setCurrentId(childId);
    },
    [currentId]
  );

  const popToParent = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) {
        onClose();
        return s;
      }
      const next = [...s];
      const parent = next.pop()!;
      setCurrentId(parent);
      return next;
    });
  }, [onClose]);

  // Browser Back mirrors the on-screen back arrow: pop the stack first,
  // close the sheet only when there's nothing left to pop.
  useBackToClose(true, popToParent);

  if (isLoading || !task) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  return (
    <TaskDetailBody
      key={task.id}
      task={task}
      categories={categories}
      canGoBack={stack.length > 0}
      onGoBack={popToParent}
      onOpenSubtask={pushChild}
      onDeleted={popToParent}
    />
  );
}

function TaskDetailBody({
  task,
  categories,
  canGoBack,
  onGoBack,
  onOpenSubtask,
  onDeleted,
}: {
  task: TaskRow;
  categories: TaskCategoryRow[];
  canGoBack: boolean;
  onGoBack: () => void;
  onOpenSubtask: (id: string) => void;
  onDeleted: () => void;
}) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createTask = useCreateTask();
  const setSubtaskDone = useToggleTaskDone();
  // Only top-level tasks can host sub-tasks (schema invariant: one level deep).
  const canHaveSubtasks = task.parentTaskId == null;
  const subtasksQuery = useTasks(canHaveSubtasks ? { parentTaskId: task.id } : undefined);
  const subtasks = canHaveSubtasks ? (subtasksQuery.data ?? []) : [];

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

  const handleCreateSubtask = () => {
    // Server rejects empty titles (`z.string().min(1)`); seed with a
    // placeholder so the create succeeds. The child's detail card opens
    // with the title textarea focused so the user overwrites it immediately.
    createTask.mutate(
      {
        title: 'New sub-task',
        parentTaskId: task.id,
        priority: 'MEDIUM',
        // Inherit the parent's category so a fresh sub-task lands in the
        // same swim lane; the user can change it inside the child.
        categoryId: task.categoryId ?? undefined,
      },
      {
        onSuccess: (created) => onOpenSubtask(created.id),
      }
    );
  };

  return (
    <div className="space-y-5">
      {canGoBack && (
        <button
          type="button"
          onClick={onGoBack}
          className="text-muted-foreground hover:text-foreground -ml-1 flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to parent
        </button>
      )}
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

        <MetaRow icon={Layers} label="Type" iconClass="text-sky-400/70">
          {/* Work-mode. Nullable, so the list carries an explicit "—" option
              that PATCHes the field back to null. */}
          <Select
            value={task.type ?? NONE}
            onValueChange={(v) => patch('type', v === NONE ? null : v)}
          >
            <SelectTrigger
              className={cn(
                'h-8 w-fit rounded-full border-none px-3 text-xs font-medium',
                task.type ? TYPE_META[task.type].pill : 'hover:bg-muted/40 bg-transparent'
              )}
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value={NONE}>—</SelectItem>
              {TASK_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {prettyType(t)}
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
            maxLength={80}
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

      {/* Sub-tasks — chips that wrap; tap a chip to drill into that task.
          The "New sub-task" button always sits on its own line at the bottom.
          Only rendered when the current task is top-level (schema allows one
          level of nesting). Placed above Notes. */}
      {canHaveSubtasks && (
        <div className="border-border/40 space-y-3 border-t pt-5">
          <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-[0.2em] uppercase">
            <ListTree className="h-4 w-4" />
            Sub-tasks
          </h3>
          {subtasks.length > 0 && (
            <ul className="divide-border/40 divide-y">
              {subtasks.map((sub) => (
                <li key={sub.id} className="flex items-center gap-2">
                  {/* Left: tap the title to drill into the sub-task. */}
                  <button
                    type="button"
                    onClick={() => onOpenSubtask(sub.id)}
                    className={cn(
                      'min-w-0 flex-1 py-2.5 text-left text-sm break-words transition-colors',
                      sub.done ? 'text-muted-foreground line-through' : 'hover:text-foreground'
                    )}
                  >
                    {sub.title || 'Untitled'}
                  </button>
                  {/* Right: done toggle. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={sub.done}
                    aria-label={
                      sub.done ? `Mark “${sub.title}” not done` : `Mark “${sub.title}” done`
                    }
                    title={sub.done ? 'Mark not done' : 'Mark done'}
                    onClick={() => setSubtaskDone(sub, !sub.done)}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      sub.done
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-muted-foreground/40 hover:border-foreground text-transparent'
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Own line at the bottom, below any chips. */}
          <div>
            <button
              type="button"
              onClick={handleCreateSubtask}
              disabled={createTask.isPending}
              className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-sm transition-colors disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              New sub-task
            </button>
          </div>
        </div>
      )}

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
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete this task?</DialogTitle>
            <DialogDescription>
              “{task.title || 'Untitled task'}” will be permanently deleted
              {canHaveSubtasks && subtasks.length > 0
                ? `, along with its ${subtasks.length} sub-task${subtasks.length === 1 ? '' : 's'}`
                : ''}
              . This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(task.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onDeleted();
                  },
                })
              }
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
