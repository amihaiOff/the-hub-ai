/**
 * Unit tests for TaskKanbanView — with the emphasis on the new `type`
 * (work-mode) column axis: how columns are built, how tasks are bucketed into
 * them, what a drop PATCHes (including the "No type" column clearing the field
 * back to null), and what the column-header quick-add pre-fills.
 *
 * @dnd-kit is mocked: a real drag can't be simulated in jsdom, so the mock
 * captures DndContext's `onDragEnd` and records every `useDroppable` id in
 * render order. Tests therefore assert against the component's own column keys
 * rather than hard-coded sentinel strings ('__notype__' stays private).
 *
 * The use-tasks mutations are mocked so `mutate` is assertable, and task-undo's
 * done-toggle is stubbed out (it needs the undo provider, which isn't under
 * test here). Radix's Popper needs ResizeObserver for the quick-add popover, so
 * a no-op shim is installed locally.
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskCategoryRow, TaskRow } from '@/lib/hooks/use-tasks';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const updateMutate = jest.fn();
const createMutate = jest.fn();
const setDone = jest.fn();

/** Captured from the mocked DndContext / useDroppable calls. */
const dnd: { onDragEnd?: (event: DragEndEvent) => void; droppableIds: string[] } = {
  droppableIds: [],
};

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: DragEndEvent) => void;
  }) => {
    dnd.onDragEnd = onDragEnd;
    return children;
  },
  MouseSensor: 'MouseSensor',
  TouchSensor: 'TouchSensor',
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false,
  }),
  useDroppable: ({ id }: { id: string }) => {
    dnd.droppableIds.push(id);
    return { setNodeRef: () => {}, isOver: false };
  },
}));

jest.mock('@/lib/hooks/use-tasks', () => ({
  useUpdateTask: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
  useCreateTask: jest.fn(() => ({ mutate: createMutate, isPending: false })),
}));

jest.mock('../task-undo', () => ({
  useToggleTaskDone: jest.fn(() => setDone),
}));

import { TaskKanbanView, type GroupBy } from '../task-kanban-view';

function makeTask(over: Partial<TaskRow>): TaskRow {
  return {
    id: 'id',
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

const tasks: TaskRow[] = [
  makeTask({ id: 't-calls', title: 'Ring the bank', type: 'CALLS' }),
  makeTask({ id: 't-deep', title: 'Write the spec', type: 'DEEP_WORK', priority: 'HIGH' }),
  makeTask({ id: 't-deep-2', title: 'Refactor sync', type: 'DEEP_WORK' }),
  makeTask({ id: 't-untyped', title: 'Someday thing', type: null }),
];

function setup(groupBy: GroupBy = 'type', taskList: TaskRow[] = tasks) {
  const onOpenTask = jest.fn();
  const utils = render(
    <TaskKanbanView
      tasks={taskList}
      categories={categories}
      onOpenTask={onOpenTask}
      groupBy={groupBy}
      selectionMode={false}
      selectedIds={new Set()}
      onEnterSelection={jest.fn()}
      onToggleSelection={jest.fn()}
    />
  );
  return { ...utils, onOpenTask };
}

/** Column keys the component registered as drop targets, in render order. */
function columnKeys(): string[] {
  return [...new Set(dnd.droppableIds)];
}

/** The header button of a column, which also carries its task count. */
function header(label: string): HTMLElement {
  return screen.getByRole('button', { name: `Collapse ${label}` });
}

/** Task count badge rendered in a column header. */
function columnCount(label: string): string {
  const spans = header(label).querySelectorAll('span');
  return spans[spans.length - 1].textContent ?? '';
}

/** The column wrapper element, for scoping card queries. */
function column(label: string): HTMLElement {
  return header(label).closest('div')!.parentElement as HTMLElement;
}

function drop(taskId: string, columnKey: string) {
  dnd.onDragEnd!({
    active: { id: taskId },
    over: { id: columnKey },
  } as unknown as DragEndEvent);
}

/** Labels of all column headers currently rendered, in order. */
function renderedColumnLabels(): string[] {
  return screen
    .getAllByRole('button', { name: /^Collapse / })
    .map((el) => el.getAttribute('aria-label')!.replace(/^Collapse /, ''));
}

describe('TaskKanbanView — group by type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dnd.droppableIds = [];
  });

  it('renders one column per task type in enum order, with "No type" last', () => {
    setup();

    expect(renderedColumnLabels()).toEqual([
      'Calls',
      'Deep work',
      'Out & about',
      'Blocked',
      'Decide',
      'Quick',
      'No type',
    ]);
    // The enum columns key off the enum value; the trailing column is a
    // sentinel, not a TaskType.
    expect(columnKeys().slice(0, 6)).toEqual([
      'CALLS',
      'DEEP_WORK',
      'OUT_AND_ABOUT',
      'BLOCKED',
      'DECIDE',
      'QUICK',
    ]);
    expect(columnKeys()).toHaveLength(7);
  });

  it('buckets each task into its type column and untyped tasks into "No type"', () => {
    setup();

    expect(columnCount('Calls')).toBe('1');
    expect(columnCount('Deep work')).toBe('2');
    expect(columnCount('No type')).toBe('1');
    expect(columnCount('Blocked')).toBe('0');

    expect(within(column('Deep work')).getByText('Write the spec')).toBeInTheDocument();
    expect(within(column('Deep work')).getByText('Refactor sync')).toBeInTheDocument();
    expect(within(column('Calls')).getByText('Ring the bank')).toBeInTheDocument();
    expect(within(column('No type')).getByText('Someday thing')).toBeInTheDocument();
    // Empty columns show the placeholder rather than a stray card.
    expect(within(column('Blocked')).getByText('No tasks')).toBeInTheDocument();
  });

  it('PATCHes type when a card is dropped on another type column', () => {
    setup();

    drop('t-calls', 'DEEP_WORK');

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith({ id: 't-calls', patch: { type: 'DEEP_WORK' } });
  });

  it('clears type to null when a card is dropped on the "No type" column', () => {
    setup();
    const noTypeKey = columnKeys()[6];

    drop('t-deep', noTypeKey);

    expect(updateMutate).toHaveBeenCalledWith({ id: 't-deep', patch: { type: null } });
  });

  it('sets type when an untyped card is dragged out of "No type"', () => {
    setup();

    drop('t-untyped', 'QUICK');

    expect(updateMutate).toHaveBeenCalledWith({ id: 't-untyped', patch: { type: 'QUICK' } });
  });

  it('does not PATCH when a card is dropped back on its own column', () => {
    setup();

    drop('t-calls', 'CALLS');
    // Same no-op for the null ↔ "No type" case.
    drop('t-untyped', columnKeys()[6]);

    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('ignores a drop with no target and an unknown card id', () => {
    setup();

    dnd.onDragEnd!({ active: { id: 't-calls' }, over: null } as unknown as DragEndEvent);
    drop('t-missing', 'DEEP_WORK');

    expect(updateMutate).not.toHaveBeenCalled();
  });

  it('pre-fills the column type in the header quick-add and creates with it', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add task in Deep work' }));
    // The chip reflects the column, so the user sees what will be stamped on.
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Deep work');

    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: 'Draft the migration' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toEqual({
      title: 'Draft the migration',
      categoryId: undefined,
      priority: 'MEDIUM',
      type: 'DEEP_WORK',
      dueDate: undefined,
      status: undefined,
    });
  });

  it('leaves type unset for the quick-add in the "No type" column', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add task in No type' }));
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Type');

    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: 'Unsorted idea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(createMutate.mock.calls[0][0]).toMatchObject({
      title: 'Unsorted idea',
      type: undefined,
    });
  });

  it('collapses a type column while keeping it a drop target', () => {
    setup();

    fireEvent.click(header('Deep work'));

    expect(screen.queryByText('Write the spec')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Deep work' })).toBeInTheDocument();
    // Still droppable: dropping onto the collapsed column PATCHes as usual.
    drop('t-calls', 'DEEP_WORK');
    expect(updateMutate).toHaveBeenCalledWith({ id: 't-calls', patch: { type: 'DEEP_WORK' } });
  });
});

describe('TaskKanbanView — other group axes still route drops correctly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dnd.droppableIds = [];
  });

  it('PATCHes priority when grouped by priority', () => {
    setup('priority');

    drop('t-deep', 'LOW');

    expect(updateMutate).toHaveBeenCalledWith({ id: 't-deep', patch: { priority: 'LOW' } });
  });

  it('PATCHes categoryId when grouped by category', () => {
    setup('category');

    drop('t-calls', 'cat-home');
    // The trailing column is "Uncategorized" → clears the field.
    drop('t-calls', columnKeys()[columnKeys().length - 1]);

    expect(updateMutate).toHaveBeenNthCalledWith(1, {
      id: 't-calls',
      patch: { categoryId: 'cat-home' },
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });

  it('PATCHes status when grouped by status, and clears it on "No status"', () => {
    const withStatus = [
      makeTask({ id: 't-a', title: 'A', status: 'In review' }),
      makeTask({ id: 't-b', title: 'B', status: '' }),
    ];
    setup('status', withStatus);

    drop('t-b', 'In review');
    drop('t-a', columnKeys()[columnKeys().length - 1]);

    expect(updateMutate).toHaveBeenNthCalledWith(1, { id: 't-b', patch: { status: 'In review' } });
    expect(updateMutate).toHaveBeenNthCalledWith(2, { id: 't-a', patch: { status: '' } });
  });
});
