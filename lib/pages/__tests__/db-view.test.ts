import type { DatabaseColumn, DatabaseRow } from '@/components/pages/database-extension';
import {
  DEFAULT_VIEW_CONFIG,
  NO_GROUP,
  applyFilters,
  columnWidth,
  groupRows,
  groupableColumns,
  resolveViewConfig,
  sortRows,
  visibleColumns,
} from '../db-view';

const cols: DatabaseColumn[] = [
  { id: 'name', name: 'Name', type: 'text' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'Todo', color: 'slate' },
      { id: 'doing', label: 'Doing', color: 'blue' },
      { id: 'done', label: 'Done', color: 'emerald' },
    ],
  },
  { id: 'budget', name: 'Budget', type: 'number' },
  { id: 'due', name: 'Due', type: 'date' },
];

const rows: DatabaseRow[] = [
  { id: 'r1', cells: { name: 'Beta', status: 'doing', budget: 200, due: '2026-03-10' } },
  { id: 'r2', cells: { name: 'Alpha', status: 'done', budget: 50, due: '2026-01-05' } },
  { id: 'r3', cells: { name: 'Gamma', status: 'todo', budget: null, due: null } },
  { id: 'r4', cells: { name: 'Delta', status: null, budget: 10, due: '2026-02-01' } },
];

describe('resolveViewConfig', () => {
  it('returns full defaults for null/legacy blocks', () => {
    expect(resolveViewConfig(null)).toEqual(DEFAULT_VIEW_CONFIG);
    expect(resolveViewConfig(undefined)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('merges a partial config over defaults', () => {
    const c = resolveViewConfig({ view: 'kanban', density: 'dense', kanbanBy: 'status' });
    expect(c.view).toBe('kanban');
    expect(c.density).toBe('dense');
    expect(c.kanbanBy).toBe('status');
    expect(c.groupBy).toBeNull();
    expect(c.hidden).toEqual({ table: [], cards: [], kanban: [] });
  });

  it('is defensive against malformed values', () => {
    const c = resolveViewConfig({
      view: 'nope',
      density: 7,
      sort: 'x',
      hidden: { table: [1, 'a', 2] },
    });
    expect(c.view).toBe('table');
    expect(c.density).toBe('airy');
    expect(c.sort).toBeNull();
    expect(c.hidden.table).toEqual(['a']); // non-strings dropped
  });

  it('normalizes a sort spec and defaults dir to asc', () => {
    expect(resolveViewConfig({ sort: { columnId: 'budget' } }).sort).toEqual({
      columnId: 'budget',
      dir: 'asc',
    });
    expect(resolveViewConfig({ sort: { columnId: 'budget', dir: 'desc' } }).sort?.dir).toBe('desc');
  });

  it('hideEmptyCardFields defaults true and only false when explicitly false', () => {
    expect(resolveViewConfig({}).hideEmptyCardFields).toBe(true);
    expect(resolveViewConfig({ hideEmptyCardFields: false }).hideEmptyCardFields).toBe(false);
  });
});

describe('columnWidth', () => {
  it('uses the stored width when present, clamped to a minimum', () => {
    expect(columnWidth({ id: 'x', name: 'X', type: 'text', width: 300 }, 1)).toBe(300);
    expect(columnWidth({ id: 'x', name: 'X', type: 'text', width: 10 }, 1)).toBe(64);
  });
  it('falls back to a wide primary default and per-type defaults', () => {
    expect(columnWidth({ id: 'n', name: 'N', type: 'text' }, 0)).toBe(280); // primary
    expect(columnWidth({ id: 'b', name: 'B', type: 'number' }, 2)).toBe(130);
  });
});

describe('visibleColumns', () => {
  it('always keeps the primary column even if listed hidden, and hides others per view', () => {
    const config = resolveViewConfig({ hidden: { table: ['name', 'budget'] } });
    const vis = visibleColumns(cols, config, 'table').map((c) => c.id);
    expect(vis).toEqual(['name', 'status', 'due']); // name kept (primary), budget hidden
  });
  it('is independent per view', () => {
    const config = resolveViewConfig({ hidden: { cards: ['status'] } });
    expect(visibleColumns(cols, config, 'table').map((c) => c.id)).toContain('status');
    expect(visibleColumns(cols, config, 'cards').map((c) => c.id)).not.toContain('status');
  });
});

describe('applyFilters', () => {
  it('returns all rows when no filter is active', () => {
    expect(applyFilters(rows, cols, {})).toHaveLength(4);
  });
  it('filters by a select filter', () => {
    const out = applyFilters(rows, cols, {
      status: { kind: 'select', optionIds: ['done', 'doing'] },
    });
    expect(out.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
  it('ANDs multiple active filters', () => {
    const out = applyFilters(rows, cols, {
      status: { kind: 'select', optionIds: ['doing', 'done', 'todo'] },
      budget: { kind: 'number', min: 100, max: null },
    });
    expect(out.map((r) => r.id)).toEqual(['r1']); // only Beta has budget>=100 and a status in set
  });
});

describe('sortRows', () => {
  it('returns input unchanged when sort is null or column missing', () => {
    expect(sortRows(rows, cols, null)).toBe(rows);
    expect(sortRows(rows, cols, { columnId: 'ghost', dir: 'asc' })).toBe(rows);
  });
  it('sorts numbers ascending with empties last', () => {
    const out = sortRows(rows, cols, { columnId: 'budget', dir: 'asc' }).map((r) => r.id);
    expect(out).toEqual(['r4', 'r2', 'r1', 'r3']); // 10,50,200, then null last
  });
  it('sorts descending (empties still last)', () => {
    const out = sortRows(rows, cols, { columnId: 'budget', dir: 'desc' }).map((r) => r.id);
    expect(out).toEqual(['r1', 'r2', 'r4', 'r3']);
  });
  it('sorts a select column by option order, not label', () => {
    const out = sortRows(rows, cols, { columnId: 'status', dir: 'asc' }).map((r) => r.id);
    // option order todo,doing,done → r3(todo), r1(doing), r2(done), then r4(null) last
    expect(out).toEqual(['r3', 'r1', 'r2', 'r4']);
  });
  it('is stable for equal keys', () => {
    const tie: DatabaseRow[] = [
      { id: 'a', cells: { budget: 5 } },
      { id: 'b', cells: { budget: 5 } },
      { id: 'c', cells: { budget: 5 } },
    ];
    expect(sortRows(tie, cols, { columnId: 'budget', dir: 'asc' }).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('groupRows', () => {
  it('returns a single implicit group when not grouping or column is not a select', () => {
    expect(groupRows(rows, cols, null)).toEqual([{ key: NO_GROUP, label: '', color: null, rows }]);
    expect(groupRows(rows, cols, 'budget')[0].rows).toHaveLength(4); // number col → ungrouped
  });
  it('groups by option order and appends a "No {col}" bucket for empty values', () => {
    const g = groupRows(rows, cols, 'status');
    expect(g.map((x) => x.key)).toEqual(['todo', 'doing', 'done', NO_GROUP]);
    expect(g.find((x) => x.key === 'todo')!.rows.map((r) => r.id)).toEqual(['r3']);
    expect(g.find((x) => x.key === NO_GROUP)!.rows.map((r) => r.id)).toEqual(['r4']);
    expect(g.find((x) => x.key === NO_GROUP)!.label).toBe('No Status');
  });
  it('drops empty option groups unless includeEmpty (Kanban)', () => {
    const noDoing = rows.filter((r) => r.cells.status !== 'doing');
    expect(groupRows(noDoing, cols, 'status').map((x) => x.key)).not.toContain('doing');
    expect(groupRows(noDoing, cols, 'status', { includeEmpty: true }).map((x) => x.key)).toContain(
      'doing'
    );
  });
  it('omits the no-value bucket when every row has a value', () => {
    const allSet = rows.filter((r) => r.cells.status != null);
    expect(groupRows(allSet, cols, 'status').map((x) => x.key)).not.toContain(NO_GROUP);
  });
});

describe('groupableColumns', () => {
  it('returns only single-select columns', () => {
    expect(groupableColumns(cols).map((c) => c.id)).toEqual(['status']);
  });
});
