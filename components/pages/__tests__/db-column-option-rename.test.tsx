/**
 * Unit tests for renaming a select option in the column sheet
 * (`components/pages/db-column-header.tsx` — `OptionRow` / `OptionNameInput`).
 *
 * These drive the real `ColumnHeader`: click the header to open the column
 * sheet, then exercise the Options list. `OptionRow` isn't exported, so going
 * through the public component is also the honest integration boundary.
 *
 * What's asserted, and why it matters:
 *
 *   - A commit calls `onSetOptions` with the option's **id and colour intact**
 *     and only `label` changed. That id-preservation is the whole safety story
 *     for this feature: cells persist the option's id, so rows already tagged
 *     with it follow the rename instead of losing their value. Asserting the id
 *     survives is the closest a unit test can get to "no data migration needed"
 *     without mounting the table and its rows.
 *   - Escape / blank / unchanged are all "leave it alone" — no `onSetOptions`.
 *   - Renaming an option never calls `onRename` (which renames the *column*).
 *     The two rename affordances sit inches apart in the same sheet.
 *
 * NOT covered here, deliberately:
 *   - The `h-px` table-cell layout fix. jsdom has no layout engine —
 *     `getBoundingClientRect` returns zeros and percentage heights never
 *     resolve — so any assertion about clickable height would be theatre.
 *     That fix was verified by measurement in a real headless browser.
 *   - Long-press to start editing. `useLongPress`'s timing/tolerance contract
 *     is already covered by `lib/hooks/__tests__/use-long-press.test.tsx`; the
 *     test below only checks that OptionRow actually *attaches* it (a real
 *     wiring risk, since the hook exposes both `handlers` and `bindRef`).
 */

import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ColumnHeader } from '../db-column-header';
import type { DatabaseColumn } from '@/lib/pages/db-schema';

const OPTIONS = [
  { id: 'opt-todo', label: 'Todo', color: 'blue' },
  { id: 'opt-done', label: 'Done', color: 'emerald' },
];

function makeColumn(overrides: Partial<DatabaseColumn> = {}): DatabaseColumn {
  return { id: 'col-status', name: 'Status', type: 'select', options: OPTIONS, ...overrides };
}

function setup(column: DatabaseColumn = makeColumn()) {
  const handlers = {
    onRename: jest.fn(),
    onChangeType: jest.fn(),
    onDelete: jest.fn(),
    onSetOptions: jest.fn(),
  };
  const utils = render(<ColumnHeader column={column} editable {...handlers} />);
  // Open the column sheet — the header name is a button when editable.
  fireEvent.click(screen.getByRole('button', { name: 'Status' }));
  return { ...utils, ...handlers };
}

/** The option's name pill (role=button so it's keyboard-reachable). */
function pill(label: string) {
  return screen.getByRole('button', { name: label });
}

describe('column sheet — renaming a select option', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('entering edit mode', () => {
    it('double-click swaps the pill for an input seeded with the current name', () => {
      setup();
      expect(screen.queryByLabelText('Rename Todo')).not.toBeInTheDocument();

      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      expect(input).toHaveValue('Todo');
    });

    it.each(['Enter', 'F2'])('%s on the focused pill starts editing', (key) => {
      setup();
      fireEvent.keyDown(pill('Todo'), { key });
      expect(screen.getByLabelText('Rename Todo')).toBeInTheDocument();
    });

    it('a long-press starts editing (the hook is attached via bindRef)', () => {
      jest.useFakeTimers();
      try {
        setup();
        const target = pill('Todo');

        // `bindRef` attaches NATIVE listeners, so a synthetic fireEvent.pointerDown
        // would not reach it. Dispatch a real event carrying the fields the hook
        // reads (jsdom has no PointerEvent constructor).
        const down = Object.assign(new Event('pointerdown', { bubbles: true }), {
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        // The long-press callback sets state from a timer, outside React's
        // event loop — act() is what flushes the resulting re-render.
        act(() => {
          target.dispatchEvent(down);
          jest.advanceTimersByTime(450);
        });

        expect(screen.getByLabelText('Rename Todo')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('committing', () => {
    it('Enter saves, changing only the label and preserving id and colour', () => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: 'In progress' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSetOptions).toHaveBeenCalledTimes(1);
      expect(onSetOptions).toHaveBeenCalledWith([
        // Same id => rows already tagged with this option follow the rename.
        { id: 'opt-todo', label: 'In progress', color: 'blue' },
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
    });

    it('blur saves too, and leaves edit mode', () => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: 'Blocked' } });
      fireEvent.blur(input);

      expect(onSetOptions).toHaveBeenCalledWith([
        { id: 'opt-todo', label: 'Blocked', color: 'blue' },
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
      expect(screen.queryByLabelText('Rename Todo')).not.toBeInTheDocument();
    });

    it('trims surrounding whitespace before saving', () => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: '  Shipped  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSetOptions).toHaveBeenCalledWith([
        { id: 'opt-todo', label: 'Shipped', color: 'blue' },
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
    });

    it('renames the option, never the column', () => {
      const { onSetOptions, onRename } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: 'Later' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSetOptions).toHaveBeenCalled();
      expect(onRename).not.toHaveBeenCalled();
    });

    it('renders the new name once the parent feeds the updated options back in', () => {
      // The component is controlled: it shows whatever `column.options` says.
      const { rerender } = setup();
      const renamed = makeColumn({
        options: [{ id: 'opt-todo', label: 'In progress', color: 'blue' }, OPTIONS[1]],
      });

      rerender(
        <ColumnHeader
          column={renamed}
          editable
          onRename={jest.fn()}
          onChangeType={jest.fn()}
          onDelete={jest.fn()}
          onSetOptions={jest.fn()}
        />
      );

      expect(pill('In progress')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Todo' })).not.toBeInTheDocument();
    });
  });

  describe('rejecting a non-edit', () => {
    /**
     * Regression: Escape used to close the ENTIRE column sheet as well as
     * cancelling the rename. Radix's Dialog listens for Escape on the document
     * in the capture phase, so the input's handler (bubble phase, and only
     * preventDefault-ing) ran too late and too low to stop it — the user lost
     * the whole sheet for a typo. Fixed with `onEscapeKeyDown` on SheetContent.
     */
    it('Escape reverts the name and leaves the column sheet open', () => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: 'Discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onSetOptions).not.toHaveBeenCalled();
      // Edit mode exited, the original name is back...
      expect(screen.queryByLabelText('Rename Todo')).not.toBeInTheDocument();
      expect(pill('Todo')).toBeInTheDocument();
      // ...and the sheet itself survived, with the rest of the list intact.
      expect(pill('Done')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/add option/i)).toBeInTheDocument();
    });

    it('Escape still closes the sheet when no option is being edited', () => {
      setup();
      fireEvent.keyDown(screen.getByPlaceholderText(/add option/i), { key: 'Escape' });
      expect(screen.queryByRole('button', { name: 'Todo' })).not.toBeInTheDocument();
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
    ])('an %s name is treated as "leave it alone", not saved as blank', (_desc, value) => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSetOptions).not.toHaveBeenCalled();
      expect(pill('Todo')).toBeInTheDocument();
    });

    it('committing an unchanged name is a no-op', () => {
      const { onSetOptions } = setup();
      fireEvent.dblClick(pill('Todo'));

      fireEvent.keyDown(screen.getByLabelText('Rename Todo'), { key: 'Enter' });

      expect(onSetOptions).not.toHaveBeenCalled();
    });
  });

  describe('coexisting with the other option controls', () => {
    it('only the double-clicked option enters edit mode', () => {
      setup();
      fireEvent.dblClick(pill('Todo'));

      expect(screen.getByLabelText('Rename Todo')).toBeInTheDocument();
      expect(screen.queryByLabelText('Rename Done')).not.toBeInTheDocument();
      // The untouched row still shows its pill.
      expect(pill('Done')).toBeInTheDocument();
    });

    it('starting an edit closes an open colour picker', () => {
      setup();
      fireEvent.click(screen.getByLabelText('Color for Todo'));
      expect(screen.getByLabelText('emerald')).toBeInTheDocument();

      fireEvent.dblClick(pill('Todo'));

      expect(screen.getByLabelText('Rename Todo')).toBeInTheDocument();
      expect(screen.queryByLabelText('emerald')).not.toBeInTheDocument();
    });

    it('removing an option still drops it by id', () => {
      const { onSetOptions } = setup();
      fireEvent.click(screen.getByLabelText('Remove Todo'));
      expect(onSetOptions).toHaveBeenCalledWith([
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
    });

    it('picking a colour changes colour only, leaving the label alone', () => {
      const { onSetOptions } = setup();
      fireEvent.click(screen.getByLabelText('Color for Todo'));
      fireEvent.click(screen.getByLabelText('amber'));

      expect(onSetOptions).toHaveBeenCalledWith([
        { id: 'opt-todo', label: 'Todo', color: 'amber' },
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
    });
  });

  describe('multiselect columns get the same editor', () => {
    it('renames an option on a multiselect column', () => {
      const { onSetOptions } = setup(makeColumn({ type: 'multiselect' }));
      fireEvent.dblClick(pill('Todo'));

      const input = screen.getByLabelText('Rename Todo');
      fireEvent.change(input, { target: { value: 'Urgent' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSetOptions).toHaveBeenCalledWith([
        { id: 'opt-todo', label: 'Urgent', color: 'blue' },
        { id: 'opt-done', label: 'Done', color: 'emerald' },
      ]);
    });
  });

  describe('legacy options with no stored colour', () => {
    it('renaming does not invent a colour for an option that never had one', () => {
      const { onSetOptions } = setup(makeColumn({ options: [{ id: 'opt-legacy', label: 'Old' }] }));
      fireEvent.dblClick(pill('Old'));

      const input = screen.getByLabelText('Rename Old');
      fireEvent.change(input, { target: { value: 'New' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // `resolveOptionColor` only picks a display colour by index; it must not
      // get persisted onto the option as a side effect of a rename.
      expect(onSetOptions).toHaveBeenCalledWith([{ id: 'opt-legacy', label: 'New' }]);
    });
  });

  describe('read-only columns', () => {
    it('cannot open the column sheet at all', () => {
      render(
        <ColumnHeader
          column={makeColumn()}
          editable={false}
          onRename={jest.fn()}
          onChangeType={jest.fn()}
          onDelete={jest.fn()}
          onSetOptions={jest.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Status' }));
      expect(screen.queryByRole('button', { name: 'Todo' })).not.toBeInTheDocument();
    });
  });
});

describe('column sheet — the Options list as a whole', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('lists every option with its own colour, rename and remove controls', () => {
    setup();
    for (const label of ['Todo', 'Done']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      expect(screen.getByLabelText(`Color for ${label}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Remove ${label}`)).toBeInTheDocument();
    }
  });

  it('adding an option appends it and keeps the existing ids untouched', () => {
    const { onSetOptions } = setup();
    const form = screen.getByPlaceholderText(/add option/i).closest('form') as HTMLFormElement;

    fireEvent.change(within(form).getByPlaceholderText(/add option/i), {
      target: { value: 'Archived' },
    });
    fireEvent.submit(form);

    expect(onSetOptions).toHaveBeenCalledTimes(1);
    const next = onSetOptions.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual(OPTIONS);
    expect(next[2]).toMatchObject({ label: 'Archived' });
  });
});
