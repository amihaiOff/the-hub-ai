/**
 * Unit tests for the new Type row in TaskDetailSheet — the primary place a
 * user sets a task's work-mode. Covers the rendered value, PATCHing a chosen
 * type, and the "—" item clearing the field back to null.
 *
 * All use-tasks hooks are mocked (the sheet loads its own task via useTask),
 * NotesEditor is stubbed out because it mounts Tiptap, and task-undo's
 * done-toggle is stubbed since it needs the undo provider. Radix Select/Dialog
 * need the ResizeObserver + pointer-capture + scrollIntoView APIs jsdom lacks,
 * and its trigger opens on a real pointerdown, hence the keyDown open path.
 *
 * Known console noise: Radix warns that this sheet's DialogContent has no
 * DialogTitle. That's a pre-existing accessibility gap in the component (not a
 * test artefact) — left visible rather than silenced.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { TaskCategoryRow, TaskRow } from '@/lib/hooks/use-tasks';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn(() => false);
Element.prototype.setPointerCapture = jest.fn();
Element.prototype.releasePointerCapture = jest.fn();

const updateMutate = jest.fn();
const task: TaskRow = {
  id: 't1',
  title: 'Write the spec',
  notes: null,
  status: '',
  done: false,
  priority: 'MEDIUM',
  type: 'CALLS',
  dueDate: null,
  sortOrder: 0,
  customFields: null,
  categoryId: null,
  ownerId: 'u1',
  assigneeId: null,
  parentTaskId: null,
  householdId: 'hh-1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  category: null,
  assignee: null,
  tags: [],
  shares: [],
};

/** Mutable so individual tests can vary the loaded task's type. */
const loaded: { task: TaskRow } = { task };

jest.mock('@/lib/hooks/use-tasks', () => ({
  useTask: jest.fn(() => ({ data: loaded.task, isLoading: false })),
  useTasks: jest.fn(() => ({ data: [], isLoading: false })),
  useUpdateTask: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
  useDeleteTask: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useCreateTask: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));

jest.mock('../notes-editor', () => ({
  NotesEditor: () => null,
}));

jest.mock('../task-undo', () => ({
  useToggleTaskDone: jest.fn(() => jest.fn()),
}));

import { TaskDetailSheet } from '../task-detail-sheet';

const categories: TaskCategoryRow[] = [
  { id: 'cat-home', name: 'Home', color: null, icon: null, sortOrder: 0, householdId: 'hh-1' },
];

function setup(over: Partial<TaskRow> = {}) {
  loaded.task = { ...task, ...over };
  return render(
    <TaskDetailSheet taskId="t1" onOpenChange={jest.fn()} categories={categories} tags={[]} />
  );
}

/**
 * The Type select trigger. Found via the meta row that owns the "Type" label
 * (label block and control are siblings inside the row), so it can't be
 * confused with the Priority / Category selects.
 */
function typeTrigger(): HTMLElement {
  const labelBlock = screen.getByText('Type').closest('div')!;
  const row = labelBlock.parentElement!;
  const trigger = row.querySelector('[role="combobox"]');
  if (!trigger) throw new Error('Type row has no select trigger');
  return trigger as HTMLElement;
}

function chooseType(label: string) {
  fireEvent.keyDown(typeTrigger(), { key: 'Enter' });
  const option = screen.getAllByRole('option').find((o) => o.textContent === label);
  if (!option) throw new Error(`No option “${label}”`);
  fireEvent.click(option);
}

describe('TaskDetailSheet — Type row', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the task’s current type', () => {
    setup({ type: 'DEEP_WORK' });
    expect(typeTrigger()).toHaveTextContent('Deep work');
  });

  it('shows an em dash when the task has no type', () => {
    setup({ type: null });
    expect(typeTrigger()).toHaveTextContent('—');
  });

  it('PATCHes the chosen type', () => {
    setup({ type: null });

    chooseType('Decide');

    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { type: 'DECIDE' } });
  });

  it('PATCHes null when the "—" item is chosen', () => {
    setup({ type: 'CALLS' });

    chooseType('—');

    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { type: null } });
  });

  it('lists every type plus the clear item', () => {
    setup({ type: 'QUICK' });

    fireEvent.keyDown(typeTrigger(), { key: 'Enter' });

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '—',
      'Calls',
      'Deep work',
      'Out & about',
      'Blocked',
      'Decide',
      'Quick',
    ]);
  });
});
