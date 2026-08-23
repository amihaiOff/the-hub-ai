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

  it('renders all view options as always-visible tabs and fires onViewChange', () => {
    const { onViewChange } = setup();

    // Every view is a tab — the picker is a segmented control, not a
    // collapsible menu.
    const kanbanTab = screen.getByRole('tab', { name: 'Kanban' });
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true');
    expect(kanbanTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(kanbanTab);
    expect(onViewChange).toHaveBeenCalledWith('kanban');
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

  it('offers Type as a group-by axis alongside status/priority/category', () => {
    const { onGroupByChange } = setup({ view: 'kanban' });

    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));

    fireEvent.click(screen.getByRole('button', { name: 'Type' }));

    expect(onGroupByChange).toHaveBeenCalledWith('type');
  });

  it('marks the active group-by axis when it is Type', () => {
    setup({ view: 'kanban', groupBy: 'type' });

    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));

    // The active option is aria-pressed; the others are not.
    expect(screen.getByRole('button', { name: 'Type' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Priority' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('offers Category and Type as the carousel axes and fires the carousel callback', () => {
    const onCarouselGroupByChange = jest.fn();
    setup({ view: 'carousel', carouselGroupBy: 'category', onCarouselGroupByChange });

    fireEvent.click(screen.getByRole('button', { name: 'Group by' }));
    const options = screen.getAllByRole('button', { pressed: false });
    expect(screen.getByRole('button', { name: 'Type' })).toBeInTheDocument();
    // Category is the active axis, so it reads as pressed.
    expect(screen.getByRole('button', { name: 'Category', pressed: true })).toBeInTheDocument();
    expect(options.some((o) => o.textContent === 'Status')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Type' }));
    expect(onCarouselGroupByChange).toHaveBeenCalledWith('type');
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

  it('only keeps Search or Group by open at a time, not both', () => {
    setup({ view: 'kanban' });

    const searchButton = screen.getByRole('button', { name: 'Search' });
    const groupButton = screen.getByRole('button', { name: 'Group by' });

    fireEvent.click(searchButton);
    expect(searchButton).toHaveAttribute('aria-expanded', 'true');

    // Opening Group by collapses Search.
    fireEvent.click(groupButton);
    expect(searchButton).toHaveAttribute('aria-expanded', 'false');
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles the Group by control closed when tapped twice', () => {
    setup({ view: 'kanban' });

    const groupButton = screen.getByRole('button', { name: 'Group by' });
    fireEvent.click(groupButton);
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(groupButton);
    expect(groupButton).toHaveAttribute('aria-expanded', 'false');
  });
});
