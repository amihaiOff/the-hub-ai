import { moveRow, reclassifyRow, moveRowToGroup } from '@/lib/pages/db-reorder';
import type { DatabaseColumn, DatabaseRow } from '@/components/pages/database-extension';

const columns: DatabaseColumn[] = [
  { id: 'name', name: 'Name', type: 'text' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'Todo' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' },
    ],
  },
  { id: 'tags', name: 'Tags', type: 'multiselect', options: [{ id: 't1', label: 'A' }] },
];

const rows: DatabaseRow[] = [
  { id: 'r1', cells: { name: 'One', status: 'todo' } },
  { id: 'r2', cells: { name: 'Two', status: 'todo' } },
  { id: 'r3', cells: { name: 'Three', status: 'doing' } },
  { id: 'r4', cells: { name: 'Four', status: null } },
];

const ids = (rs: DatabaseRow[]) => rs.map((r) => r.id);

describe('moveRow', () => {
  it('moves a row up to an earlier position', () => {
    expect(ids(moveRow(rows, 'r3', 'r1'))).toEqual(['r3', 'r1', 'r2', 'r4']);
  });

  it('moves a row down to a later position', () => {
    expect(ids(moveRow(rows, 'r1', 'r3'))).toEqual(['r2', 'r3', 'r1', 'r4']);
  });

  it('moves a row to the last position', () => {
    expect(ids(moveRow(rows, 'r1', 'r4'))).toEqual(['r2', 'r3', 'r4', 'r1']);
  });

  it('no-ops (same reference) when active === over', () => {
    expect(moveRow(rows, 'r2', 'r2')).toBe(rows);
  });

  it('no-ops when either id is missing', () => {
    expect(moveRow(rows, 'nope', 'r1')).toBe(rows);
    expect(moveRow(rows, 'r1', 'nope')).toBe(rows);
  });

  it('is immutable — does not mutate the input', () => {
    moveRow(rows, 'r1', 'r4');
    expect(ids(rows)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});

describe('reclassifyRow', () => {
  it('sets the active row group cell to an option id', () => {
    const next = reclassifyRow(rows, columns, 'r1', 'status', 'done');
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBe('done');
    // Others untouched.
    expect(next.find((r) => r.id === 'r2')).toBe(rows[1]);
  });

  it('sets the active row group cell to null (no-value bucket)', () => {
    const next = reclassifyRow(rows, columns, 'r1', 'status', null);
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBeNull();
  });

  it('no-ops when the value is already set', () => {
    expect(reclassifyRow(rows, columns, 'r1', 'status', 'todo')).toBe(rows);
  });

  it('no-ops for a missing row', () => {
    expect(reclassifyRow(rows, columns, 'nope', 'status', 'done')).toBe(rows);
  });

  it('no-ops for a non-select (multiselect) column', () => {
    expect(reclassifyRow(rows, columns, 'r1', 'tags', 't1')).toBe(rows);
  });

  it('no-ops for a null / unknown group column', () => {
    expect(reclassifyRow(rows, columns, 'r1', null, 'x')).toBe(rows);
    expect(reclassifyRow(rows, columns, 'r1', 'ghost', 'x')).toBe(rows);
  });

  it('is immutable — does not mutate the input', () => {
    reclassifyRow(rows, columns, 'r1', 'status', 'done');
    expect(rows[0].cells.status).toBe('todo');
  });
});

describe('moveRowToGroup', () => {
  it('reclassifies AND positions at overId when dropped on a card', () => {
    // r4 (no value) → doing group, landing at r3's slot.
    const next = moveRowToGroup(rows, columns, 'r4', 'status', 'doing', 'r3');
    const moved = next.find((r) => r.id === 'r4')!;
    expect(moved.cells.status).toBe('doing');
    expect(ids(next)).toEqual(['r1', 'r2', 'r4', 'r3']);
  });

  it('appends within the target group when dropped on empty space (overId null)', () => {
    // r4 (no value) → todo group with no overId → appended after last todo (r2).
    const next = moveRowToGroup(rows, columns, 'r4', 'status', 'todo', null);
    expect(next.find((r) => r.id === 'r4')!.cells.status).toBe('todo');
    expect(ids(next)).toEqual(['r1', 'r2', 'r4', 'r3']);
  });

  it('appends to the end when the target group is otherwise empty', () => {
    // r1 → done group (no existing done rows) with no overId → end of array.
    const next = moveRowToGroup(rows, columns, 'r1', 'status', 'done', null);
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBe('done');
    expect(ids(next)).toEqual(['r2', 'r3', 'r4', 'r1']);
  });

  it('moves into the no-value bucket (targetValue null) at overId', () => {
    const next = moveRowToGroup(rows, columns, 'r1', 'status', null, 'r4');
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBeNull();
    expect(ids(next)).toEqual(['r2', 'r3', 'r4', 'r1']);
  });

  it('is immutable — does not mutate the input', () => {
    moveRowToGroup(rows, columns, 'r4', 'status', 'doing', 'r3');
    expect(ids(rows)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(rows[3].cells.status).toBeNull();
  });

  // --- Edge cases added during coverage review ---

  it('dropping a row onto ITSELF while changing group reclassifies and appends within the new group', () => {
    // overId === activeId falls through to the append path; r1 todo → doing,
    // landing after the last existing doing member (r3).
    const next = moveRowToGroup(rows, columns, 'r1', 'status', 'doing', 'r1');
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBe('doing');
    expect(ids(next)).toEqual(['r2', 'r3', 'r1', 'r4']);
  });

  it('with a null groupColId but a real overId, performs a positional move without reclassifying', () => {
    const next = moveRowToGroup(rows, columns, 'r1', null, 'x', 'r3');
    // No group column to resolve → cells untouched, pure arrayMove.
    expect(next.find((r) => r.id === 'r1')!.cells.status).toBe('todo');
    expect(ids(next)).toEqual(['r2', 'r3', 'r1', 'r4']);
  });

  it('no-ops (same reference) with a null groupColId and no overId', () => {
    expect(moveRowToGroup(rows, columns, 'r1', null, 'x', null)).toBe(rows);
  });

  it('no-ops (same reference) when the group column is a multiselect', () => {
    // Multiselect never groups: no reclassify, no append → original array.
    expect(moveRowToGroup(rows, columns, 'r1', 'tags', 't1', null)).toBe(rows);
  });

  it('reclassifies but does NOT reposition when overId does not exist', () => {
    // r4 null → doing; overId 'ghost' has no slot, so moveRow leaves order intact.
    const next = moveRowToGroup(rows, columns, 'r4', 'status', 'doing', 'ghost');
    expect(next.find((r) => r.id === 'r4')!.cells.status).toBe('doing');
    expect(ids(next)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('full no-op (same reference) when the row is already last in its group on empty-space drop', () => {
    // r4 already in the no-value bucket and last in the array → nothing changes.
    expect(moveRowToGroup(rows, columns, 'r4', 'status', null, null)).toBe(rows);
  });
});
