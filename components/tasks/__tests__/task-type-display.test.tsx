/**
 * Unit tests for the shared task-`type` (work-mode) presentation layer:
 * `prettyType` labels, the `TYPE_META` icon/colour table every surface indexes
 * into, and the `TypeBadge` used by the list view.
 *
 * TYPE_META completeness matters at runtime, not just at compile time: the
 * table view, detail sheet, kanban dots and quick-add chip all do
 * `TYPE_META[type].pill / .dot` unguarded, so a missing entry is a crash.
 */

import { render, screen } from '@testing-library/react';
import { TASK_TYPES } from '@/lib/validations/tasks';
import { prettyType } from '../task-filters-bar';
import { TYPE_META, TypeBadge } from '../task-list-view';

describe('prettyType', () => {
  it('maps every enum value to its display label', () => {
    expect(TASK_TYPES.map(prettyType)).toEqual([
      'Calls',
      'Deep work',
      'Out & about',
      'Blocked',
      'Decide',
      'Quick',
    ]);
  });

  it('falls back to the raw value for an unknown type', () => {
    // An older/newer client could hand us a value this build doesn't know.
    expect(prettyType('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(prettyType('')).toBe('');
  });
});

describe('TYPE_META', () => {
  it('has an icon, text, dot and pill class for every task type', () => {
    for (const t of TASK_TYPES) {
      const meta = TYPE_META[t];
      expect(meta).toBeDefined();
      expect(meta.icon).toBeTruthy();
      expect(meta.text).toBeTruthy();
      expect(meta.dot).toBeTruthy();
      expect(meta.pill).toBeTruthy();
    }
  });

  it('covers exactly the enum — no stale keys left behind', () => {
    expect(Object.keys(TYPE_META).sort()).toEqual([...TASK_TYPES].sort());
  });

  it('gives each type a distinct accent so columns stay tellable apart', () => {
    const dots = TASK_TYPES.map((t) => TYPE_META[t].dot);
    expect(new Set(dots).size).toBe(TASK_TYPES.length);
  });
});

describe('TypeBadge', () => {
  it('renders the label for a typed task', () => {
    render(<TypeBadge type="OUT_AND_ABOUT" />);
    expect(screen.getByText('Out & about')).toBeInTheDocument();
  });

  it('renders an em dash placeholder when the task has no type', () => {
    const { container } = render(<TypeBadge type={null} />);
    expect(container).toHaveTextContent('—');
    // No label leaks through for the null case.
    expect(screen.queryByText('Calls')).not.toBeInTheDocument();
  });
});
