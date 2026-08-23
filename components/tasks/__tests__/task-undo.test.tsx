/**
 * Tests for the tasks Undo feature. useUpdateTask is mocked so we can assert
 * the status PATCHes; timers are faked to drive the 10-second undo window.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import type { TaskRow } from '@/lib/hooks/use-tasks';

const updateMutate = jest.fn();

jest.mock('@/lib/hooks/use-tasks', () => ({
  useUpdateTask: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
}));

import { useToggleTaskDone, TaskUndoButton } from '../task-undo';

function makeTask(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't1',
    title: 'Water plants',
    notes: null,
    status: 'In progress',
    done: false,
    priority: 'MEDIUM',
    type: null,
    dueDate: null,
    sortOrder: 0,
    customFields: null,
    categoryId: null,
    ownerId: 'u1',
    assigneeId: null,
    parentTaskId: null,
    householdId: 'h1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    category: null,
    assignee: null,
    tags: [],
    shares: [],
    ...over,
  };
}

/** Test harness: a "mark done" button wired to the shared hook + the Undo UI. */
function Harness({ task }: { task: TaskRow }) {
  const setDone = useToggleTaskDone();
  return (
    <>
      <button onClick={() => setDone(task, true)}>mark done</button>
      <TaskUndoButton />
    </>
  );
}

describe('tasks Undo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    updateMutate.mockClear();
  });
  afterEach(() => {
    // Drain the 10s timer so state doesn't leak between tests.
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('shows no Undo button until a task is marked done', () => {
    render(<Harness task={makeTask()} />);
    expect(screen.queryByLabelText(/^Undo/)).not.toBeInTheDocument();
  });

  it('marks the task done and reveals the Undo button', () => {
    render(<Harness task={makeTask()} />);
    fireEvent.click(screen.getByText('mark done'));
    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { done: true } });
    expect(screen.getByLabelText(/^Undo/)).toBeInTheDocument();
  });

  it('un-does (done → false) when Undo is clicked, leaving the status label alone', () => {
    render(<Harness task={makeTask({ status: 'Blocked' })} />);
    fireEvent.click(screen.getByText('mark done'));
    updateMutate.mockClear();

    fireEvent.click(screen.getByLabelText(/^Undo/));
    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { done: false } });
    // The button hides immediately after undoing.
    expect(screen.queryByLabelText(/^Undo/)).not.toBeInTheDocument();
  });

  it('hides the Undo button automatically after the 10-second window', () => {
    render(<Harness task={makeTask()} />);
    fireEvent.click(screen.getByText('mark done'));
    expect(screen.getByLabelText(/^Undo/)).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.queryByLabelText(/^Undo/)).not.toBeInTheDocument();
  });
});
