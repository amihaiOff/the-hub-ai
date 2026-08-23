/**
 * Unit tests for TaskCarouselView — the mobile category carousel.
 *
 * Covers the three behaviours the view owns: which columns/chips get built
 * (categories, plus Uncategorized only when it holds tasks), the row gestures
 * (tap expands status + due on their own lines, long press opens full-screen),
 * and the relative due labels shown at the row's right edge.
 *
 * jsdom has no layout, so `scrollTo`/offset metrics are stubbed — the chip↔
 * carousel sync is asserted through `aria-selected` and the scrollTo call
 * rather than real scroll positions. task-undo's done toggle is stubbed
 * (it needs the undo provider, which isn't under test here).
 */

import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { TaskCategoryRow, TaskRow } from '@/lib/hooks/use-tasks';

const setDone = jest.fn();
jest.mock('../task-undo', () => ({
  useToggleTaskDone: jest.fn(() => setDone),
}));

// The column headers' quick-add creates through this hook; mocking it keeps
// the view free of a QueryClientProvider and makes the payload assertable.
const createMutate = jest.fn();
jest.mock('@/lib/hooks/use-tasks', () => ({
  useCreateTask: jest.fn(() => ({ mutate: createMutate, isPending: false })),
}));

import { TaskCarouselView, relativeDueLabel, type CarouselGroupBy } from '../task-carousel-view';

const scrollToSpy = jest.fn();
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  Element.prototype.scrollTo = scrollToSpy as unknown as Element['scrollTo'];
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
});

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
  { id: 'cat-fin', name: 'Finance', color: '#8FDDB0', sortOrder: 0, icon: null, householdId: 'hh' },
  { id: 'cat-gen', name: 'General', color: '#A8CAFF', sortOrder: 1, icon: null, householdId: 'hh' },
];

const tasks: TaskRow[] = [
  makeTask({ id: 't-1', title: 'Call Tiaa about taxes', categoryId: 'cat-fin' }),
  makeTask({
    id: 't-2',
    title: 'File the report',
    categoryId: 'cat-fin',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: '2026-04-14T00:00:00.000Z',
  }),
  makeTask({ id: 't-3', title: 'Book the flight', categoryId: 'cat-gen', type: 'OUT_AND_ABOUT' }),
];

function setup(taskList: TaskRow[] = tasks, groupBy: CarouselGroupBy = 'category') {
  const onOpenTask = jest.fn();
  const utils = render(
    <TaskCarouselView
      tasks={taskList}
      categories={categories}
      onOpenTask={onOpenTask}
      groupBy={groupBy}
    />
  );
  return { ...utils, onOpenTask };
}

/**
 * jsdom implements no PointerEvent, so @testing-library's `fireEvent.pointerDown`
 * silently drops `button` / `clientX` / `clientY` — exactly the fields the
 * long-press hook reads. Dispatch a plain Event with those fields attached.
 */
function firePointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  { x = 0, y = 0 }: { x?: number; y?: number } = {}
) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { button: 0, clientX: x, clientY: y });
  fireEvent(el, event);
}

/** The row element (role=button) whose accessible content is `title`. */
function row(title: string): HTMLElement {
  return screen.getByText(title).closest('[role="button"]') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TaskCarouselView — columns and chips', () => {
  it('renders a chip and a column per category', () => {
    setup();
    const chips = screen.getAllByRole('tab');
    expect(chips.map((c) => c.textContent)).toEqual(['Finance', 'General']);
    // Each column header repeats the category name with its task count.
    expect(screen.getAllByText('Finance')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument(); // Finance holds two
  });

  it('adds an Uncategorized column only when a task has no category', () => {
    setup();
    expect(screen.queryByRole('tab', { name: 'Uncategorized' })).not.toBeInTheDocument();

    screen.getByRole('tab', { name: 'Finance' }); // sanity: still rendered
    setup([...tasks, makeTask({ id: 't-orphan', title: 'Loose end', categoryId: null })]);
    expect(screen.getAllByRole('tab', { name: 'Uncategorized' })).toHaveLength(1);
  });

  it('marks the first chip active and activates another on tap', () => {
    setup();
    const [finance, general] = screen.getAllByRole('tab');
    expect(finance).toHaveAttribute('aria-selected', 'true');
    expect(general).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(general);
    expect(general).toHaveAttribute('aria-selected', 'true');
    expect(finance).toHaveAttribute('aria-selected', 'false');
    // The carousel track is scrolled to the matching column.
    expect(scrollToSpy).toHaveBeenCalled();
  });

  it('renders an empty-state placeholder for a category with no tasks', () => {
    setup([tasks[0]]);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('sorts empty groups to the end, keeping the rest in category order', () => {
    // Only General holds a task, so Finance drops behind it.
    setup([tasks[2]]);
    expect(screen.getAllByRole('tab').map((c) => c.textContent)).toEqual(['General', 'Finance']);

    // With both populated the user-defined order stands.
    setup(tasks);
    expect(screen.getAllByRole('tab').map((c) => c.textContent)).toEqual([
      'General',
      'Finance',
      'Finance',
      'General',
    ]);
  });
});

describe('TaskCarouselView — row gestures', () => {
  it('expands a row on tap, revealing status and due date on separate lines', () => {
    setup();
    const target = row('File the report');
    expect(target).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-expanded', 'true');
    expect(within(target).getByText('Status: In Progress')).toBeInTheDocument();
    expect(within(target).getByText(/^Due /)).toBeInTheDocument();

    // Tapping again collapses it.
    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows placeholders when the task has no status or due date', () => {
    setup();
    const target = row('Call Tiaa about taxes');
    fireEvent.click(target);
    expect(within(target).getByText('No status')).toBeInTheDocument();
    expect(within(target).getByText('No due date')).toBeInTheDocument();
  });

  it('only expands one row at a time', () => {
    setup();
    fireEvent.click(row('Call Tiaa about taxes'));
    fireEvent.click(row('File the report'));
    expect(row('Call Tiaa about taxes')).toHaveAttribute('aria-expanded', 'false');
    expect(row('File the report')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the task full-screen on long press instead of expanding it', () => {
    jest.useFakeTimers();
    const { onOpenTask } = setup();
    const target = row('File the report');

    firePointer(target, 'pointerdown', { x: 10, y: 10 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onOpenTask).toHaveBeenCalledWith('t-2');

    // The trailing click is consumed, so the row must not also expand.
    firePointer(target, 'pointerup', { x: 10, y: 10 });
    fireEvent.click(target);
    expect(target).toHaveAttribute('aria-expanded', 'false');
    jest.useRealTimers();
  });

  it('does not open full-screen when the pointer moves (a carousel swipe)', () => {
    jest.useFakeTimers();
    const { onOpenTask } = setup();
    const target = row('File the report');

    firePointer(target, 'pointerdown', { x: 10, y: 10 });
    firePointer(target, 'pointermove', { x: 90, y: 10 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onOpenTask).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('toggles done from the row without expanding it', () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mark “File the report” done/ }));
    expect(setDone).toHaveBeenCalledWith(expect.objectContaining({ id: 't-2' }), true);
    expect(row('File the report')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TaskCarouselView — grouping by type', () => {
  it('builds a chip and column per work type, non-empty ones first', () => {
    setup(tasks, 'type');
    const chips = screen.getAllByRole('tab').map((c) => c.textContent);
    // Only "Out & about" holds a task, and "No type" the two untyped ones;
    // the rest are empty and fall to the end in enum order.
    expect(chips).toEqual([
      'Out & about',
      'No type',
      'Calls',
      'Deep work',
      'Blocked',
      'Decide',
      'Quick',
    ]);
  });

  it('omits the "No type" column when every task is typed', () => {
    setup([tasks[2]], 'type');
    expect(screen.queryByRole('tab', { name: 'No type' })).not.toBeInTheDocument();
  });

  it('shows the work-type icon on the row, but not when grouped by type', () => {
    const { unmount } = setup();
    expect(screen.getByLabelText('Out & about')).toBeInTheDocument();
    unmount();

    // Grouped by type the column header already carries it.
    setup(tasks, 'type');
    expect(screen.queryByLabelText('Out & about')).not.toBeInTheDocument();
  });
});

describe('TaskCarouselView — column quick-add', () => {
  /** Type the title into the open quick-add popover and submit it. */
  function submitQuickAdd(title: string) {
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: title },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
  }

  it('gives every column a + that names its group', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add task in Finance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add task in General' })).toBeInTheDocument();
  });

  it('pre-fills the column category when grouped by category', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add task in General' }));
    submitQuickAdd('Water the plants');

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Water the plants', categoryId: 'cat-gen' }),
      expect.anything()
    );
  });

  it('pre-fills the column type when grouped by type', () => {
    setup(tasks, 'type');
    fireEvent.click(screen.getByRole('button', { name: 'Add task in Deep work' }));
    submitQuickAdd('Draft the memo');

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Draft the memo', type: 'DEEP_WORK' }),
      expect.anything()
    );
  });

  it('pre-fills nothing from the catch-all column', () => {
    setup([...tasks, makeTask({ id: 't-orphan', title: 'Loose end', categoryId: null })]);
    fireEvent.click(screen.getByRole('button', { name: 'Add task in Uncategorized' }));
    submitQuickAdd('Something');

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Something', categoryId: undefined }),
      expect.anything()
    );
  });
});

describe('relativeDueLabel', () => {
  const now = new Date(2026, 3, 10); // 10 Apr 2026, local

  it('returns null without a due date', () => {
    expect(relativeDueLabel(null, now)).toBeNull();
  });

  it.each([
    ['2026-04-09T00:00:00.000Z', 'overdue'],
    ['2026-04-10T00:00:00.000Z', 'today'],
    ['2026-04-11T00:00:00.000Z', 'tomorrow'],
    ['2026-04-15T00:00:00.000Z', 'this week'],
    ['2026-04-17T00:00:00.000Z', 'this week'],
  ])('labels %s as "%s"', (iso, expected) => {
    expect(relativeDueLabel(iso, now)).toBe(expected);
  });

  it('falls back to the month past a week out, and adds the year beyond this one', () => {
    expect(relativeDueLabel('2026-06-02T00:00:00.000Z', now)).toBe('Jun');
    expect(relativeDueLabel('2027-06-02T00:00:00.000Z', now)).toBe('Jun 27');
  });
});
