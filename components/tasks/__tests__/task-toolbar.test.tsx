/**
 * Unit tests for TaskToolbar — the accordion-style single-line toolbar that
 * replaced the old ViewSwitcher + TaskFiltersBar. Covers the expand/collapse
 * behaviour of the Search, View, and Group by controls, that selecting an
 * option fires the right callback, and that opening one control collapses
 * whichever was open before (mutual exclusivity).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { List, LayoutGrid, Table } from 'lucide-react';
import { TaskToolbar, type ViewOption } from '../task-toolbar';

const viewOptions: ViewOption[] = [
  { id: 'list', label: 'List', icon: List },
  { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Table },
];

function setup(overrides: Partial<React.ComponentProps<typeof TaskToolbar>> = {}) {
  const onSearchChange = jest.fn();
  const onViewChange = jest.fn();
  const onGroupByChange = jest.fn();

  const utils = render(
    <TaskToolbar
      search=""
      onSearchChange={onSearchChange}
      view="list"
      onViewChange={onViewChange}
      viewOptions={viewOptions}
      groupBy="status"
      onGroupByChange={onGroupByChange}
      {...overrides}
    />
  );

  return { ...utils, onSearchChange, onViewChange, onGroupByChange };
}

describe('TaskToolbar', () => {
  it('reveals and focuses the search input when the Search control is tapped', () => {
    setup();

    const searchButton = screen.getByRole('button', { name: 'Search' });
    const input = screen.getByPlaceholderText('Search tasks, tags, or projects…');

    // Collapsed by default: control is not expanded and its wrapper is inert
    // (so the hidden input/clear button leave the tab order + a11y tree).
    expect(searchButton).toHaveAttribute('aria-expanded', 'false');
    expect(input.parentElement).toHaveAttribute('inert');

    fireEvent.click(searchButton);

    expect(searchButton).toHaveAttribute('aria-expanded', 'true');
    expect(input.parentElement).not.toHaveAttribute('inert');
    expect(input).toHaveFocus();
  });

  it('calls onSearchChange as the user types', () => {
    const { onSearchChange } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByPlaceholderText('Search tasks, tags, or projects…'), {
      target: { value: 'invoice' },
    });

    expect(onSearchChange).toHaveBeenCalledWith('invoice');
  });

  it('selects a view and collapses the View control', () => {
    const { onViewChange } = setup();

    const viewButton = screen.getByRole('button', { name: 'View' });
    fireEvent.click(viewButton);
    expect(viewButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));

    expect(onViewChange).toHaveBeenCalledWith('kanban');
    // Choosing an option collapses the control again.
    expect(viewButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides the Group by control unless the Kanban view is active', () => {
    const { rerender } = setup({ view: 'list' });
    expect(screen.queryByRole('button', { name: 'Group by' })).not.toBeInTheDocument();

    rerender(
      <TaskToolbar
        search=""
        onSearchChange={jest.fn()}
        view="kanban"
        onViewChange={jest.fn()}
        viewOptions={viewOptions}
        groupBy="status"
        onGroupByChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Group by' })).toBeInTheDocument();
  });

  it('selects a group-by option and collapses the Group by control', () => {
    const { onGroupByChange } = setup({ view: 'kanban' });

    const groupButton = screen.getByRole('button', { name: 'Group by' });
    fireEvent.click(groupButton);
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Priority' }));

    expect(onGroupByChange).toHaveBeenCalledWith('priority');
    expect(groupButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the Calendar view control only for the Calendar view and fires its callback', () => {
    const onCalendarViewChange = jest.fn();
    const { rerender } = setup({ view: 'kanban', onCalendarViewChange });
    expect(screen.queryByRole('button', { name: 'Calendar view' })).not.toBeInTheDocument();

    rerender(
      <TaskToolbar
        search=""
        onSearchChange={jest.fn()}
        view="calendar"
        onViewChange={jest.fn()}
        viewOptions={viewOptions}
        groupBy="status"
        onGroupByChange={jest.fn()}
        calendarView="month"
        onCalendarViewChange={onCalendarViewChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(onCalendarViewChange).toHaveBeenCalledWith('week');
  });

  it('only keeps one control open at a time (mutual exclusivity)', () => {
    setup({ view: 'kanban' });

    const searchButton = screen.getByRole('button', { name: 'Search' });
    const viewButton = screen.getByRole('button', { name: 'View' });
    const groupButton = screen.getByRole('button', { name: 'Group by' });

    fireEvent.click(searchButton);
    expect(searchButton).toHaveAttribute('aria-expanded', 'true');

    // Opening View collapses Search.
    fireEvent.click(viewButton);
    expect(searchButton).toHaveAttribute('aria-expanded', 'false');
    expect(viewButton).toHaveAttribute('aria-expanded', 'true');

    // Opening Group by collapses View.
    fireEvent.click(groupButton);
    expect(viewButton).toHaveAttribute('aria-expanded', 'false');
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles a control closed when its own button is tapped twice', () => {
    setup();

    const viewButton = screen.getByRole('button', { name: 'View' });
    fireEvent.click(viewButton);
    expect(viewButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(viewButton);
    expect(viewButton).toHaveAttribute('aria-expanded', 'false');
  });
});
