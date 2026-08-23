/**
 * Unit tests for QuickAddPopover — the compact "what needs doing?" form used
 * by the FAB and by each kanban column header.
 *
 * Focus: the options payload handed to `onSubmit`. The `type` (work-mode)
 * field is optional, so the tests cover all three paths through it — left
 * unset (null), pre-selected via `initialType`, picked from the dropdown, and
 * reset back to null through the "No type" item.
 *
 * jsdom notes: Radix's Popper needs ResizeObserver, which jsdom doesn't
 * implement, so a no-op shim is installed locally (kept out of jest.setup so
 * the rest of the suite keeps running against stock jsdom).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { TaskCategoryRow } from '@/lib/hooks/use-tasks';
import { QuickAddPopover, type QuickAddOptions } from '../quick-add-popover';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const categories: TaskCategoryRow[] = [
  { id: 'cat-home', name: 'Home', color: null, icon: null, sortOrder: 0, householdId: 'hh-1' },
];

function setup(props: Partial<React.ComponentProps<typeof QuickAddPopover>> = {}) {
  const onSubmit = jest.fn();
  const onOpenChange = jest.fn();
  const utils = render(
    <QuickAddPopover
      open
      onOpenChange={onOpenChange}
      categories={categories}
      onSubmit={onSubmit}
      {...props}
    >
      <button type="button">Add task</button>
    </QuickAddPopover>
  );
  return { ...utils, onSubmit, onOpenChange };
}

/** Type the title then hit the submit (check) button. */
function submitWithTitle(title: string) {
  fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
}

/**
 * Open the type dropdown. Radix's trigger opens on a real pointerdown, which
 * jsdom's synthetic PointerEvent doesn't satisfy, so the keyboard path (Enter
 * on the trigger) is used instead — same `onOpenToggle`.
 */
function openTypeMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Choose type' }), { key: 'Enter' });
}

/** Open the type dropdown and click one of its items by visible label. */
function pickType(label: string) {
  openTypeMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

function lastOptions(onSubmit: jest.Mock): QuickAddOptions {
  return onSubmit.mock.calls[onSubmit.mock.calls.length - 1][1] as QuickAddOptions;
}

describe('QuickAddPopover', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits with type null when the user never touches the type chip', () => {
    const { onSubmit } = setup();

    // Unset chip reads as the generic "Type" placeholder.
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Type');

    submitWithTitle('Call the plumber');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toBe('Call the plumber');
    expect(lastOptions(onSubmit)).toEqual({
      categoryId: null,
      priority: 'MEDIUM',
      type: null,
      dueDate: null,
    });
  });

  it('pre-selects initialType and passes it through on submit', () => {
    const { onSubmit } = setup({ initialType: 'DEEP_WORK' });

    // Pre-selected chip shows the display label, not the enum value.
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Deep work');

    submitWithTitle('Write the spec');

    expect(lastOptions(onSubmit).type).toBe('DEEP_WORK');
  });

  it('lets the user pick a type from the dropdown', () => {
    const { onSubmit } = setup();

    pickType('Out & about');
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Out & about');

    submitWithTitle('Post the parcel');

    expect(lastOptions(onSubmit).type).toBe('OUT_AND_ABOUT');
  });

  it('clears a pre-selected type back to null via "No type"', () => {
    const { onSubmit } = setup({ initialType: 'CALLS' });

    pickType('No type');
    expect(screen.getByRole('button', { name: 'Choose type' })).toHaveTextContent('Type');

    submitWithTitle('Undecided work');

    expect(lastOptions(onSubmit).type).toBeNull();
  });

  it('offers every task type plus the reset item in the dropdown', () => {
    setup();

    openTypeMenu();

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'No type',
      'Calls',
      'Deep work',
      'Out & about',
      'Blocked',
      'Decide',
      'Quick',
    ]);
  });

  it('keeps type alongside the other options in one payload', () => {
    const { onSubmit } = setup({ initialCategoryId: 'cat-home', initialPriority: 'URGENT' });

    pickType('Quick');
    submitWithTitle('  Trim the hedge  ');

    expect(onSubmit.mock.calls[0][0]).toBe('Trim the hedge');
    expect(lastOptions(onSubmit)).toEqual({
      categoryId: 'cat-home',
      priority: 'URGENT',
      type: 'QUICK',
      dueDate: null,
    });
  });

  it('does not submit an empty title, so no payload is produced', () => {
    const { onSubmit } = setup({ initialType: 'BLOCKED' });

    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
