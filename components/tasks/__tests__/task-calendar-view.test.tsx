/**
 * Unit tests for TaskCalendarView — the month calendar of tasks.
 *
 * The system clock is pinned to 2026-07-08 so "today", the default selected
 * day, and the rendered month are deterministic. useUpdateTask is mocked so the
 * done-toggle exposes an assertable `mutate`. Tests assume the CI timezone is
 * UTC (Node's default), so the midday-UTC due dates land on the intended day.
 */

import { render, screen, fireEvent, within } from '@testing-library/react';
import type { TaskRow } from '@/lib/hooks/use-tasks';

const updateMutate = jest.fn();

jest.mock('@/lib/hooks/use-tasks', () => ({
  useUpdateTask: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
}));

import { TaskCalendarView } from '../task-calendar-view';

function makeTask(over: Partial<TaskRow>): TaskRow {
  return {
    id: 'id',
    title: 'Task',
    notes: null,
    status: 'TODO',
    priority: 'MEDIUM',
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

const tasks: TaskRow[] = [
  makeTask({ id: 't-today', title: 'Dentist', dueDate: '2026-07-08T12:00:00.000Z' }),
  makeTask({ id: 't-tomorrow', title: 'Groceries', dueDate: '2026-07-09T12:00:00.000Z' }),
  makeTask({ id: 't-none', title: 'Someday', dueDate: null }),
];

function setup() {
  const onOpenTask = jest.fn();
  const onAddTaskOnDate = jest.fn();
  const utils = render(
    <TaskCalendarView tasks={tasks} onOpenTask={onOpenTask} onAddTaskOnDate={onAddTaskOnDate} />
  );
  return { ...utils, onOpenTask, onAddTaskOnDate };
}

describe('TaskCalendarView', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-08T09:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.clearAllMocks());

  it('renders the current month and today’s task in the agenda', () => {
    setup();
    expect(screen.getByText('July 2026')).toBeInTheDocument();
    // Today (the 8th) is selected by default, so its task shows in the agenda.
    expect(screen.getByText('Dentist')).toBeInTheDocument();
  });

  it('lists undated tasks in a separate section', () => {
    setup();
    expect(screen.getByText('No due date (1)')).toBeInTheDocument();
    expect(screen.getByText('Someday')).toBeInTheDocument();
  });

  it('selecting another day shows that day’s tasks', () => {
    setup();
    // The 9th isn't selected initially, so its task isn't in the agenda yet.
    fireEvent.click(screen.getByRole('button', { name: /July 9/ }));
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('navigates to the next month and clears the agenda', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    // Aug 1 is auto-selected; no tasks are due then.
    expect(screen.getByText('No tasks due.')).toBeInTheDocument();
  });

  it('adds a task on the selected day with an ISO due date', () => {
    const { onAddTaskOnDate } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add task on this day' }));
    expect(onAddTaskOnDate).toHaveBeenCalledTimes(1);
    const iso = onAddTaskOnDate.mock.calls[0][0] as string;
    expect(new Date(iso).getUTCFullYear()).toBe(2026);
  });

  it('opens a task when its agenda row is clicked', () => {
    const { onOpenTask } = setup();
    fireEvent.click(screen.getByText('Dentist'));
    expect(onOpenTask).toHaveBeenCalledWith('t-today');
  });

  it('toggles done from the agenda checkbox', () => {
    setup();
    const row = screen.getByText('Dentist').closest('div')!;
    fireEvent.click(within(row).getByLabelText('Mark task as done'));
    expect(updateMutate).toHaveBeenCalledWith({ id: 't-today', patch: { status: 'DONE' } });
  });
});
