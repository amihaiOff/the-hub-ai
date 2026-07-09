'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Undo2 } from 'lucide-react';
import { useUpdateTask, type TaskRow } from '@/lib/hooks/use-tasks';

/** How long the Undo affordance stays on screen after marking a task done. */
const UNDO_WINDOW_MS = 10_000;

interface UndoEntry {
  id: string;
  title: string;
  /** Status the task had before it was marked done — restored on undo. */
  previousStatus: TaskRow['status'];
}

// ─── Tiny external store ────────────────────────────────────────────────
//
// Marking a task done happens in several sibling components (list, kanban,
// table and calendar cards), while the Undo button lives up in TasksClient.
// A module-level store lets any of them record an undo without threading a
// provider through every view — the button subscribes via useSyncExternalStore.

let current: UndoEntry | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return current;
}

function registerUndo(entry: UndoEntry) {
  if (timer) clearTimeout(timer);
  current = entry;
  emit();
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, UNDO_WINDOW_MS);
}

function clearUndo() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

/**
 * Returns a `setDone(task, done)` callback shared by every task view. It PATCHes
 * the status (optimistically, via useUpdateTask) and, when a task is marked
 * DONE, records an undo entry so the floating Undo button can restore its
 * previous status within a short window.
 */
export function useToggleTaskDone() {
  const update = useUpdateTask();
  return useCallback(
    (task: TaskRow, done: boolean) => {
      update.mutate({ id: task.id, patch: { status: done ? 'DONE' : 'TODO' } });
      if (done) {
        registerUndo({ id: task.id, title: task.title, previousStatus: task.status });
      }
    },
    [update]
  );
}

/**
 * Floating "Undo" button pinned to the bottom-left. Shown for UNDO_WINDOW_MS
 * after a task is marked done; tapping it restores the task's previous status.
 * A thin bar depletes over the window as a visual countdown.
 */
export function TaskUndoButton() {
  const pending = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const update = useUpdateTask();

  if (!pending) return null;

  const handleUndo = () => {
    update.mutate({ id: pending.id, patch: { status: pending.previousStatus } });
    clearUndo();
  };

  return (
    <div
      className="fixed left-5 z-40"
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={handleUndo}
        aria-label={`Undo — restore “${pending.title}”`}
        title="Undo"
        className="bg-foreground text-background relative flex h-11 items-center gap-2 overflow-hidden rounded-full pr-5 pl-4 shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Undo2 className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">Undo</span>
        {/* Depleting countdown bar — visual timer for the undo window. Keyed on
            the task id so it remounts and restarts each time a task is marked done. */}
        <span
          key={pending.id}
          className="undo-countdown bg-background/40 absolute bottom-0 left-0 h-0.5 w-full"
          style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
        />
      </button>
    </div>
  );
}
