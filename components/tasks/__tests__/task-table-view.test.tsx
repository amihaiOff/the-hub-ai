/**
 * Unit tests for TaskTableView's new Type column — the inline select that
 * PATCHes `type`, including the "—" option that clears it back to null.
 *
 * jsdom shims: Radix's Select needs ResizeObserver plus the pointer-capture /
 * scrollIntoView DOM APIs jsdom doesn't implement. They're installed locally so
 * the rest of the suite keeps running against stock jsdom. The select is opened
 * with a keyDown (Radix's trigger opens on a real pointerdown, which jsdom's
 * synthetic PointerEvent doesn't satisfy).
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
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
const deleteMutate = jest.fn();

jest.mock('@/lib/hooks/use-tasks', () => ({
  useUpdateTask: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
  useDeleteTask: jest.fn(() => ({ mutate: deleteMutate, isPending: false })),
}));

jest.mock('../task-undo', () => ({
  useToggleTaskDone: jest.fn(() => jest.fn()),
}));

import { TaskTableView } from '../task-table-view';

function makeTask(over: Partial<TaskRow>): TaskRow {
  return {
    id: 't1',
    title: 'Task',
    notes: null,
    status: '',
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
    householdId: 'hh-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    category: null,
    assignee: null,
    tags: [],
    shares: [],
    ...over,
  };
}

const categories: TaskCategoryRow[] = [
  { id: 'cat-home', name: 'Home', color: null, icon: null, sortOrder: 0, householdId: 'hh-1' },
];

function setup(task: TaskRow) {
  return render(
    <TaskTableView tasks={[task]} categories={categories} tags={[]} onOpenTask={jest.fn()} />
  );
}

/**
 * The Type cell's select trigger. Located by column position (the row's cell
 * at the index of the "Type" header) rather than by its text, because several
 * cells in a row can read "—" at once.
 */
function typeTrigger(): HTMLElement {
  const headers = screen.getAllByRole('columnheader');
  const typeIndex = headers.findIndex((h) => h.textContent === 'Type');
  expect(typeIndex).toBeGreaterThan(-1);
  const row = screen.getAllByRole('row')[1];
  const cell = row.querySelectorAll('td')[typeIndex] as HTMLElement;
  return within(cell).getByRole('combobox');
}

function chooseType(next: string) {
  fireEvent.keyDown(typeTrigger(), { key: 'Enter' });
  const option = screen.getAllByRole('option').find((o) => o.textContent === next);
  if (!option) throw new Error(`No option “${next}”`);
  fireEvent.click(option);
}

describe('TaskTableView — Type column', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders a Type header column', () => {
    setup(makeTask({}));
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
  });

  it("shows the task's type label, and an em dash when it has none", () => {
    const { unmount } = setup(makeTask({ type: 'DEEP_WORK' }));
    expect(typeTrigger()).toHaveTextContent('Deep work');
    unmount();

    setup(makeTask({ type: null }));
    expect(typeTrigger()).toHaveTextContent('—');
  });

  it('PATCHes the chosen type', () => {
    setup(makeTask({ type: null }));

    chooseType('Blocked');

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { type: 'BLOCKED' } });
  });

  it('PATCHes type back to null when "—" is chosen', () => {
    setup(makeTask({ type: 'CALLS' }));

    chooseType('—');

    expect(updateMutate).toHaveBeenCalledWith({ id: 't1', patch: { type: null } });
  });

  it('offers every type plus the clear option', () => {
    setup(makeTask({ type: 'QUICK' }));

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
