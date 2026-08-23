/**
 * Unit tests for TaskFiltersBar's new Type chip — that picking a type puts it
 * on the filters object, that "Any type" removes the key entirely (rather than
 * sending undefined through to the query string), and that an active type
 * filter is counted in the Filter badge.
 *
 * The component is pure props-in/callback-out, so no hooks need mocking.
 * Radix's Popper needs ResizeObserver, and its dropdown trigger opens on a
 * real pointerdown that jsdom's synthetic PointerEvent doesn't satisfy — hence
 * the local shim plus the keyDown open path.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { TaskFilters } from '@/lib/validations/tasks';
import { TaskFiltersBar } from '../task-filters-bar';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

function setup(filters: TaskFilters = {}) {
  const onFiltersChange = jest.fn();
  const utils = render(
    <TaskFiltersBar
      filters={filters}
      onFiltersChange={onFiltersChange}
      sort="due-asc"
      onSortChange={jest.fn()}
      categories={[]}
      tags={[]}
    />
  );
  return { ...utils, onFiltersChange };
}

/** Expand the chip row (collapsed while no filter is active). */
function expandFilters() {
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
}

/** Open the Type chip's dropdown and click one of its items. */
function pickType(label: string) {
  const chip = screen.getByRole('button', { name: /^Type/ });
  fireEvent.keyDown(chip, { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

describe('TaskFiltersBar — Type filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers a Type chip in the expanded filter row', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Type/ })).not.toBeInTheDocument();

    expandFilters();

    expect(screen.getByRole('button', { name: /^Type/ })).toBeInTheDocument();
  });

  it('sets the chosen type on the filters object', () => {
    const { onFiltersChange } = setup();
    expandFilters();

    pickType('Deep work');

    expect(onFiltersChange).toHaveBeenCalledWith({ type: 'DEEP_WORK' });
  });

  it('keeps other active filters when the type changes', () => {
    const { onFiltersChange } = setup({ priority: 'HIGH', search: 'plumb' });
    expandFilters();

    pickType('Calls');

    expect(onFiltersChange).toHaveBeenCalledWith({
      priority: 'HIGH',
      search: 'plumb',
      type: 'CALLS',
    });
  });

  it('drops the key entirely when "Any type" is picked', () => {
    const { onFiltersChange } = setup({ type: 'BLOCKED', priority: 'LOW' });

    // An active filter keeps the chip row open without expanding it.
    pickType('Any type');

    expect(onFiltersChange).toHaveBeenCalledWith({ priority: 'LOW' });
    const next = onFiltersChange.mock.calls[0][0] as TaskFilters;
    expect('type' in next).toBe(false);
  });

  it('shows the selected type on the chip and counts it in the Filter badge', () => {
    setup({ type: 'OUT_AND_ABOUT' });

    // Label and value sit in sibling spans, so no space between them in the
    // concatenated text content.
    expect(screen.getByRole('button', { name: /^Type/ })).toHaveTextContent('Type· Out & about');
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveTextContent('1');
  });

  it('counts type alongside the other filters in the badge', () => {
    setup({ type: 'QUICK', priority: 'HIGH', status: 'In review' });
    expect(screen.getByRole('button', { name: 'Filter' })).toHaveTextContent('3');
  });
});
