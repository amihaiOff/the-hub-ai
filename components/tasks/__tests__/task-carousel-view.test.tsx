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
  it('builds a chip and column per work type, in enum order', () => {
    setup(tasks, 'type');
    const chips = screen.getAllByRole('tab').map((c) => c.textContent);
    // Every type gets a column, plus "No type" for the two untyped tasks.
    expect(chips).toEqual([
      'Calls',
      'Deep work',
      'Out & about',
      'Blocked',
      'Decide',
      'Quick',
      'No type',
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
