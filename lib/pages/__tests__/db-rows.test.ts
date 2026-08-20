import { setRowCell, setRowBody, primaryColumn, hasBodyContent } from '@/lib/pages/db-rows';
import type { DatabaseColumn, DatabaseRow } from '@/components/pages/database-extension';

const rows: DatabaseRow[] = [
  { id: 'r1', cells: { c1: 'a', c2: 1 } },
  { id: 'r2', cells: { c1: 'b' } },
];

describe('setRowCell', () => {
  it('updates a single cell and leaves others untouched', () => {
    const next = setRowCell(rows, 'r1', 'c2', 42);
    expect(next[0].cells).toEqual({ c1: 'a', c2: 42 });
    expect(next[1]).toBe(rows[1]); // untouched rows keep identity
  });

  it('is immutable — does not mutate the input', () => {
    setRowCell(rows, 'r1', 'c1', 'z');
    expect(rows[0].cells.c1).toBe('a');
  });

  it('no-ops for an unknown row id', () => {
    const next = setRowCell(rows, 'nope', 'c1', 'z');
    expect(next).toEqual(rows);
  });

  it('can set a cell to null', () => {
    const next = setRowCell(rows, 'r2', 'c1', null);
    expect(next[1].cells.c1).toBeNull();
  });
});

describe('setRowBody', () => {
  const body = { type: 'doc', content: [] };

  it('sets the body on the target row only', () => {
    const next = setRowBody(rows, 'r2', body);
    expect(next[1].body).toBe(body);
    expect(next[0].body).toBeUndefined();
  });

  it('adds a body to a legacy row that had none', () => {
    expect(rows[0].body).toBeUndefined();
    const next = setRowBody(rows, 'r1', body);
    expect(next[0].body).toBe(body);
  });

  it('is immutable and no-ops for an unknown row id', () => {
    const next = setRowBody(rows, 'nope', body);
    expect(next).toEqual(rows);
    expect(rows[0].body).toBeUndefined();
  });

  it('preserves existing cells when setting a body (no field clobber)', () => {
    const next = setRowBody(rows, 'r1', body);
    expect(next[0].cells).toEqual({ c1: 'a', c2: 1 });
  });
});

// Guards the merge invariant behind the deferred body commit: applying a cell
// edit and a body edit in either order keeps both (a stale-snapshot write would
// otherwise drop the other). The component reads the freshest rows via a ref so
// the two compose exactly like this.
describe('interleaved cell + body edits compose', () => {
  const base: DatabaseRow[] = [{ id: 'r1', cells: { c1: 'a', c2: 1 } }];
  const body = { type: 'doc', content: [] };

  it('cell edit then body edit keeps both', () => {
    const afterCell = setRowCell(base, 'r1', 'c2', 99);
    const afterBody = setRowBody(afterCell, 'r1', body);
    expect(afterBody[0]).toEqual({ id: 'r1', cells: { c1: 'a', c2: 99 }, body });
  });

  it('body edit then cell edit keeps both', () => {
    const afterBody = setRowBody(base, 'r1', body);
    const afterCell = setRowCell(afterBody, 'r1', 'c2', 99);
    expect(afterCell[0]).toEqual({ id: 'r1', cells: { c1: 'a', c2: 99 }, body });
  });
});

describe('hasBodyContent', () => {
  it('is false for undefined/null/non-object', () => {
    expect(hasBodyContent(undefined)).toBe(false);
    expect(hasBodyContent(null)).toBe(false);
    expect(hasBodyContent('x')).toBe(false);
  });

  it('is false for an empty doc or only-empty-paragraph doc', () => {
    expect(hasBodyContent({ type: 'doc', content: [] })).toBe(false);
    expect(hasBodyContent({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false);
    expect(hasBodyContent({ type: 'doc', content: [{ type: 'paragraph', content: [] }] })).toBe(
      false
    );
  });

  it('is true for a non-empty paragraph', () => {
    expect(
      hasBodyContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      })
    ).toBe(true);
  });

  it('is true for any non-paragraph block (heading, table, image…)', () => {
    expect(hasBodyContent({ type: 'doc', content: [{ type: 'heading' }] })).toBe(true);
    expect(hasBodyContent({ type: 'doc', content: [{ type: 'table' }] })).toBe(true);
  });
});

describe('primaryColumn', () => {
  const cols: DatabaseColumn[] = [
    { id: 'c1', name: 'Name', type: 'text' },
    { id: 'c2', name: 'Status', type: 'select' },
  ];

  it('returns the first column', () => {
    expect(primaryColumn(cols)).toBe(cols[0]);
  });

  it('returns null for an empty column set', () => {
    expect(primaryColumn([])).toBeNull();
  });
});
